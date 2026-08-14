/*
 * NoteRepository — the only API the UI talks to for notes.
 *
 * Responsibilities:
 *   - CRUD over NoteDao
 *   - FTS search
 *   - Wiki-link extraction (delegated to util/WikiLinkExtractor)
 *   - Live backlink maintenance: every save triggers a recompute of who links to
 *     this note, and the count is updated on the row.
 */
package com.pulse.android.data.repo

import com.pulse.android.data.db.NoteDao
import com.pulse.android.data.db.SearchResult
import com.pulse.android.data.model.Note
import com.pulse.android.util.WikiLinkExtractor
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class NoteRepository(
    private val noteDao: NoteDao,
) {
    // ----- Live observation -----
    fun observePinned(): Flow<List<Note>> = noteDao.observePinned()
    fun observeRecent(): Flow<List<Note>> = noteDao.observeRecent()
    fun observeCount(): Flow<Int> = noteDao.observeCount()
    fun observeNote(id: String): Flow<Note?> = noteDao.observeById(id)

    suspend fun getById(id: String): Note? = noteDao.getById(id)

    // ----- Save (with backlink maintenance) -----
    /**
     * Save a note. Auto-maintains backlinks:
     *  - on create / update, scans every other note for `[[thisNoteTitle]]`
     *  - updates `backlinkCount` for this note
     *  - returns the list of incoming-backlink note ids (capped at 50)
     */
    suspend fun save(note: Note, now: Long = System.currentTimeMillis()): Note {
        val withTimestamp = note.copy(
            updatedAt = now,
            sizeBytes = note.body.toByteArray(Charsets.UTF_8).size,
        )
        noteDao.upsert(withTimestamp)
        val sources = computeBacklinks(withTimestamp)
        noteDao.setBacklinkCount(withTimestamp.id, sources.size)
        return withTimestamp.copy(backlinkCount = sources.size)
    }

    suspend fun create(
        title: String = "",
        body: String = "",
        now: Long = System.currentTimeMillis(),
    ): Note = save(
        Note(
            id = UUID.randomUUID().toString(),
            title = title,
            body = body,
            createdAt = now,
            updatedAt = now,
        ),
        now = now,
    )

    suspend fun delete(id: String) = noteDao.deleteById(id)

    suspend fun togglePinned(note: Note) {
        noteDao.upsert(note.copy(pinned = !note.pinned, updatedAt = System.currentTimeMillis()))
    }

    // ----- Search -----
    suspend fun search(rawQuery: String): List<SearchResult> {
        val q = rawQuery.trim()
        if (q.isEmpty()) return emptyList()
        // FTS5 syntax: wrap in quotes for literal phrase, or use `*` for prefix.
        // Strip characters that have meaning in FTS5 to keep the user query safe.
        val safe = q.replace(Regex("[^\\p{L}\\p{Nd} _\\-]"), " ").trim()
        if (safe.isEmpty()) return emptyList()
        // Add a trailing `*` for prefix match on the last token.
        val ftsQuery = safe.split(" ").filter { it.isNotBlank() }.joinToString(" ") { "$it*" }
        return noteDao.search(ftsQuery)
    }

    // ----- Backlinks -----
    private suspend fun computeBacklinks(note: Note): List<String> {
        val title = note.title.trim()
        if (title.isEmpty()) return emptyList()
        val bodies = noteDao.allBodiesExcluding(note.id)
        return bodies
            .filter { (_, _, body) ->
                WikiLinkExtractor.extract(body).any { it.equals(title, ignoreCase = true) }
            }
            .map { it.id }
    }

    /**
     * Resolve incoming backlinks for the editor bottom panel.
     * Returns up to 3 titles + a snippet around the first match.
     */
    suspend fun backlinksFor(noteId: String, limit: Int = 3): List<Backlink> {
        val note = noteDao.getById(noteId) ?: return emptyList()
        if (note.title.isBlank()) return emptyList()
        val bodies = noteDao.allBodiesExcluding(noteId)
        val matches = bodies
            .filter { (_, _, body) ->
                WikiLinkExtractor.extract(body).any { it.equals(note.title, ignoreCase = true) }
            }
            .take(50)
        return matches.map { (id, title, body) ->
            val idx = body.indexOf("[[${note.title}]]", ignoreCase = true)
            val snippetStart = maxOf(0, idx - 30)
            val snippetEnd = minOf(body.length, idx + 30)
            val snippet = if (idx < 0) body.take(50) else body.substring(snippetStart, snippetEnd)
            Backlink(id = id, title = title, snippet = snippet)
        }.take(limit)
    }
}

data class Backlink(
    val id: String,
    val title: String,
    val snippet: String,
)
