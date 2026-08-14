/*
 * NoteEditorViewModel — autosave + backlinks + autocomplete state.
 *
 * Save strategy: 1.5s after the last keystroke, persist via NoteRepository.
 * Backlinks are recomputed on every save (cheap for the typical corpus).
 */
package com.pulse.android.ui.notes

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.model.Note
import com.pulse.android.data.repo.Backlink
import com.pulse.android.data.repo.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NoteEditorState(
    val id: String = "",
    val title: String = "",
    val body: String = "",
    val isNew: Boolean = true,
    val backlinks: List<Backlink> = emptyList(),
    val backlinkCount: Int = 0,
    val isSaving: Boolean = false,
    val lastSavedAt: Long = 0L,
    val isLoading: Boolean = true,
)

@HiltViewModel
class NoteEditorViewModel @Inject constructor(
    private val noteRepo: NoteRepository,
    saved: SavedStateHandle,
) : ViewModel() {

    private val noteId: String = saved.get<String>("noteId").orEmpty()

    private val _state = MutableStateFlow(NoteEditorState(id = noteId, isNew = noteId.isBlank() || noteId == "new"))
    val state = _state.asStateFlow()

    private var saveJob: Job? = null

    init {
        if (_state.value.isNew) {
            // New note — start empty
            _state.value = _state.value.copy(isLoading = false)
        } else {
            viewModelScope.launch {
                noteRepo.observeNote(noteId).collectLatest { note ->
                    if (note != null) {
                        _state.value = _state.value.copy(
                            id = note.id,
                            title = note.title,
                            body = note.body,
                            isNew = false,
                            backlinkCount = note.backlinkCount,
                            isLoading = false,
                        )
                        refreshBacklinks()
                    } else {
                        _state.value = _state.value.copy(isLoading = false)
                    }
                }
            }
        }
    }

    fun setTitle(t: String) {
        _state.value = _state.value.copy(title = t)
        scheduleSave()
    }

    fun setBody(b: String) {
        _state.value = _state.value.copy(body = b)
        scheduleSave()
    }

    /** Insert markdown at the current cursor offset. */
    fun insertAtCursor(text: String, cursor: Int) {
        val cur = _state.value.body
        val newBody = cur.substring(0, cursor.coerceIn(0, cur.length)) + text + cur.substring(cursor.coerceIn(0, cur.length))
        setBody(newBody)
    }

    private fun scheduleSave() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(1_500)
            saveNow()
        }
    }

    private suspend fun saveNow() {
        val s = _state.value
        if (s.title.isBlank() && s.body.isBlank()) return
        _state.value = s.copy(isSaving = true)
        val now = System.currentTimeMillis()
        val toSave = if (s.isNew) {
            noteRepo.create(title = s.title, body = s.body, now = now).also {
                _state.value = _state.value.copy(id = it.id, isNew = false)
            }
        } else {
            noteRepo.save(
                Note(
                    id = s.id,
                    title = s.title,
                    body = s.body,
                    createdAt = now,
                    updatedAt = now,
                ),
                now = now,
            )
        }
        refreshBacklinks()
        _state.value = _state.value.copy(
            isSaving = false,
            lastSavedAt = now,
            backlinkCount = toSave.backlinkCount,
        )
    }

    suspend fun flushSave() = saveNow()

    private suspend fun refreshBacklinks() {
        val id = _state.value.id
        if (id.isBlank()) return
        val links = noteRepo.backlinksFor(id, limit = 5)
        _state.value = _state.value.copy(
            backlinks = links,
            backlinkCount = links.size,
        )
    }

    suspend fun searchTitlesForAutocomplete(query: String, limit: Int = 8): List<String> {
        val q = query.trim()
        if (q.isBlank()) return noteRepo.observePinned().let { flow ->
            // We don't collect here; instead, fall through to a search-by-prefix.
            emptyList<String>()
        }
        // Use FTS via search(); pick the unique titles for the autocomplete.
        return noteRepo.search(q)
            .map { it.title }
            .distinct()
            .take(limit)
    }

    fun delete(onDeleted: () -> Unit) {
        viewModelScope.launch {
            saveJob?.cancel()
            if (_state.value.id.isNotBlank()) noteRepo.delete(_state.value.id)
            onDeleted()
        }
    }
}
