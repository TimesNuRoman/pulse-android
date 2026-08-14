/*
 * ChatDao — message + conversation persistence.
 */
package com.pulse.android.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.pulse.android.data.model.ChatMessage
import com.pulse.android.data.model.Conversation
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatMessageDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(message: ChatMessage)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertConversation(conv: Conversation)

    @Query("SELECT * FROM chat_messages WHERE conversationId = :convId ORDER BY createdAt ASC")
    fun observeMessages(convId: String): Flow<List<ChatMessage>>

    @Query("SELECT * FROM conversations ORDER BY lastActiveAt DESC")
    fun observeConversations(): Flow<List<Conversation>>

    @Query("SELECT * FROM conversations WHERE id = :id LIMIT 1")
    suspend fun getConversation(id: String): Conversation?

    @Query("SELECT id FROM conversations ORDER BY lastActiveAt DESC LIMIT 1")
    suspend fun lastConversationId(): String?

    @Query("DELETE FROM chat_messages WHERE conversationId = :convId")
    suspend fun clearMessages(convId: String)

    @Query("DELETE FROM conversations WHERE id = :id")
    suspend fun deleteConversation(id: String)

    @Query("SELECT COUNT(*) FROM chat_messages")
    suspend fun messageCount(): Int
}
