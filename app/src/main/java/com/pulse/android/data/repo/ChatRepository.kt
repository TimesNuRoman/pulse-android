/*
 * ChatRepository — wraps ChatMessageDao + Conversation lifecycle.
 * RAG (notes as context) lives in the ViewModel layer; this repo is just storage.
 */
package com.pulse.android.data.repo

import com.pulse.android.data.db.ChatMessageDao
import com.pulse.android.data.model.ChatMessage
import com.pulse.android.data.model.Conversation
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class ChatRepository(
    private val chatDao: ChatMessageDao,
) {
    fun observeConversations(): Flow<List<Conversation>> = chatDao.observeConversations()

    fun observeMessages(convId: String): Flow<List<ChatMessage>> = chatDao.observeMessages(convId)

    suspend fun getConversation(id: String): Conversation? = chatDao.getConversation(id)

    suspend fun lastConversationId(): String? = chatDao.lastConversationId()

    /** New conversation seeded with a system message. */
    suspend fun newConversation(model: String?, now: Long = System.currentTimeMillis()): Conversation {
        val conv = Conversation(
            id = UUID.randomUUID().toString(),
            title = "New chat",
            model = model,
            createdAt = now,
            lastActiveAt = now,
        )
        chatDao.upsertConversation(conv)
        return conv
    }

    suspend fun append(
        conversationId: String,
        role: String,
        content: String,
        model: String? = null,
        now: Long = System.currentTimeMillis(),
    ): ChatMessage {
        val msg = ChatMessage(
            id = UUID.randomUUID().toString(),
            conversationId = conversationId,
            role = role,
            content = content,
            model = model,
            createdAt = now,
        )
        chatDao.upsert(msg)
        chatDao.upsertConversation(
            (chatDao.getConversation(conversationId) ?: newConversation(model, now))
                .copy(
                    lastActiveAt = now,
                    title = if (role == "user") content.take(60) else (chatDao.getConversation(conversationId)?.title ?: "New chat"),
                ),
        )
        return msg
    }

    suspend fun clearHistory(convId: String) = chatDao.clearMessages(convId)
    suspend fun deleteConversation(id: String) = chatDao.deleteConversation(id)
    suspend fun messageCount(): Int = chatDao.messageCount()
}
