/*
 * NotesListViewModel — exposes pinned + recent note lists, plus a search shortcut.
 * Empty state: shown when count == 0 (e.g. before the seed callback runs in
 * some startup races). The DB seed is synchronous on first open so the
 * empty state should only flash for a few frames.
 */
package com.pulse.android.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.model.Note
import com.pulse.android.data.repo.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotesListState(
    val pinned: List<Note> = emptyList(),
    val recent: List<Note> = emptyList(),
    val total: Int = 0,
)

@HiltViewModel
class NotesListViewModel @Inject constructor(
    private val noteRepo: NoteRepository,
) : ViewModel() {

    val state: StateFlow<NotesListState> = combine(
        noteRepo.observePinned(),
        noteRepo.observeRecent(),
        noteRepo.observeCount(),
    ) { pinned, recent, total ->
        NotesListState(pinned = pinned, recent = recent, total = total)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NotesListState())

    fun create(onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val note = noteRepo.create()
            onCreated(note.id)
        }
    }

    fun togglePin(note: Note) {
        viewModelScope.launch { noteRepo.togglePinned(note) }
    }
}
