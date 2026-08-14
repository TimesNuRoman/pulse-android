/*
 * ChatMessage — one turn in a conversation.
 * role: "user" | "assistant" | "system"
 * model: tag of the model that produced the assistant message (e.g. "gemma3:4b")
 */
package com.pulse.android.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "chat_messages",
    indices = [Index("conversationId"), Index("createdAt")],
)
data class ChatMessage(
    @PrimaryKey val id: String,         // UUID
    val conversationId: String,
    val role: String,                   // "user" | "assistant" | "system"
    val content: String,
    val model: String? = null,          // gemma3:4b, etc.
    val createdAt: Long,
)

/**
 * One conversation = a group of messages with a shared id.
 * Title is the first user message (truncated) for display in history drawer.
 */
@Entity(
    tableName = "conversations",
    indices = [Index("lastActiveAt")],
)
data class Conversation(
    @PrimaryKey val id: String,
    val title: String,
    val model: String? = null,
    val createdAt: Long,
    val lastActiveAt: Long,
)
