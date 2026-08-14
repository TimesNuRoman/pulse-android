/*
 * SyncQueue — outbound queue of encrypted changes.
 * type: "note_upsert" | "note_delete" | "chat_upsert" | "conversation_upsert" | "conversation_delete"
 * encryptedPayload: base64 of AES-GCM ciphertext (nonce || ciphertext || tag)
 * attempts / lastErrorAt: for retry & circuit breaking.
 */
package com.pulse.android.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sync_queue",
    indices = [Index("createdAt"), Index("entityId")],
)
data class SyncQueueItem(
    @PrimaryKey val id: String,             // UUID
    val type: String,                       // see above
    val entityId: String,
    val encryptedPayload: String,           // base64 ciphertext
    val createdAt: Long,
    val attempts: Int = 0,
    val lastErrorAt: Long? = null,
    val lastError: String? = null,
)
