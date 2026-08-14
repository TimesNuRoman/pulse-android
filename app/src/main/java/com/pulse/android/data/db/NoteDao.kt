/*
 * NoteDao — note CRUD + search + backlinks.
 *
 * Search runs through FTS5 (`notes_fts`); if the query is empty, we fall back to
 * `recent` (all notes by `updatedAt DESC`). Pinned notes are loaded by `pinnedAll`.
 */
package com.pulse.android.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.pulse.android.data.model.Note
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {

    // ----- CRUD -----
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: Note)

    @Update
    suspend fun update(note: Note)

    @Delete
    suspend fun delete(note: Note)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): Note?

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<Note?>

    // ----- List views -----
    @Query("SELECT * FROM notes WHERE pinned = 1 ORDER BY updatedAt DESC LIMIT 5")
    fun observePinned(): Flow<List<Note>>

    @Query("SELECT * FROM notes WHERE pinned = 0 ORDER BY updatedAt DESC")
    fun observeRecent(): Flow<List<Note>>

    @Query("SELECT COUNT(*) FROM notes")
    fun observeCount(): Flow<Int>

    // ----- Backlinks (live) -----
    /**
     * Find notes whose `body` contains a [[<thisTitle>]] reference.
     * We pull every non-empty body and filter in Kotlin — for ~10k notes this is fine
     * (Room + FTS make candidate selection fast; LIKE '%[[X]]%' on a column is also ok
     * up to a few hundred kB per note). If the corpus grows past ~50k notes, switch
     * to a dedicated `note_links(targetTitle)` materialised table.
     */
    @Query("SELECT id, title, body FROM notes WHERE id != :excludeId")
    suspend fun allBodiesExcluding(excludeId: String): List<NoteBodyTuple>

    @Query("UPDATE notes SET backlinkCount = :count WHERE id = :id")
    suspend fun setBacklinkCount(id: String, count: Int)

    // ----- Search (FTS5) -----
    /**
     * Prefix match on title + body, ranked by hit count. `query` is treated as
     * already-escaped for FTS (caller's responsibility). Empty query returns empty list.
     */
    @Query(
        """
        SELECT n.id, n.title, n.body, n.updatedAt, n.pinned, n.backlinkCount,
               snippet(notes_fts, 1, '<<', '>>', '…', 12) AS snippet,
               bm25(notes_fts) AS rank
        FROM notes_fts
        JOIN notes n ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH :query
        ORDER BY rank
        LIMIT 50
        """,
    )
    suspend fun search(query: String): List<SearchResult>
}

data class NoteBodyTuple(
    val id: String,
    val title: String,
    val body: String,
)

data class SearchResult(
    val id: String,
    val title: String,
    val body: String,
    val updatedAt: Long,
    val pinned: Boolean,
    val backlinkCount: Int,
    val snippet: String,
)
