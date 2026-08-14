/*
 * Note entity — primary row in the local DB.
 * `body` holds raw markdown source. Rendered view is derived.
 * `backlinkCount` is a denormalised counter updated whenever a note is saved
 * (cheap read for the list view; live updates go through `backlinks` join).
 */
package com.pulse.android.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Fts4
import androidx.room.PrimaryKey

@Entity(tableName = "notes")
data class Note(
    @PrimaryKey val id: String,            // UUID
    val title: String,
    val body: String,                      // markdown source
    val createdAt: Long,
    val updatedAt: Long,
    val pinned: Boolean = false,
    val sizeBytes: Int = 0,
    val backlinkCount: Int = 0,
)

/**
 * FTS4 virtual table. Room's @Fts4 with `contentEntity` mirrors the `notes` table —
 * title + body are indexed, and Room auto-generates triggers to keep the FTS row
 * in sync with the source. We use FTS4 instead of FTS5 because Room's KSP support
 * is more stable across versions; FTS4 with `tokenize=porter` still gives us
 * English stemming + prefix search via the `*` suffix.
 *
 * `rowid` matches the source `notes.rowid`; queries must JOIN on rowid.
 */
@Fts4(contentEntity = Note::class)
@Entity(tableName = "notes_fts")
data class NoteFts(
    @PrimaryKey
    @ColumnInfo(name = "rowid")
    val rowid: Long,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "body")  val body: String,
)
