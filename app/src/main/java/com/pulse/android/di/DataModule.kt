/*
 * DataModule — Hilt module that wires Room + repositories + native engines.
 *
 * Scope: @Singleton. Instances live for the lifetime of the application.
 */
package com.pulse.android.di

import android.content.Context
import com.pulse.android.data.api.AiApi
import com.pulse.android.data.api.AuthApi
import com.pulse.android.data.db.AppDatabase
import com.pulse.android.data.db.ChatMessageDao
import com.pulse.android.data.db.NoteDao
import com.pulse.android.data.db.SyncQueueDao
import com.pulse.android.data.llm.LlamaEngine
import com.pulse.android.data.llm.ModelDownloader
import com.pulse.android.data.repo.ChatRepository
import com.pulse.android.data.repo.NoteRepository
import com.pulse.android.data.voice.VoiceTranscriber
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        AppDatabase.get(context)

    @Provides
    fun provideNoteDao(db: AppDatabase): NoteDao = db.noteDao()

    @Provides
    fun provideChatDao(db: AppDatabase): ChatMessageDao = db.chatDao()

    @Provides
    fun provideSyncQueueDao(db: AppDatabase): SyncQueueDao = db.syncQueueDao()

    @Provides @Singleton
    fun provideNoteRepository(noteDao: NoteDao): NoteRepository = NoteRepository(noteDao)

    @Provides @Singleton
    fun provideChatRepository(chatDao: ChatMessageDao): ChatRepository = ChatRepository(chatDao)

    @Provides @Singleton
    fun provideLlamaEngine(): LlamaEngine = LlamaEngine()

    @Provides @Singleton
    fun provideModelDownloader(@ApplicationContext context: Context): ModelDownloader =
        ModelDownloader(context)

    @Provides @Singleton
    fun provideVoiceTranscriber(@ApplicationContext context: Context): VoiceTranscriber =
        VoiceTranscriber(context)

    @Provides @Singleton
    fun provideAuthApi(): AuthApi = AuthApi()

    @Provides @Singleton
    fun provideAiApi(): AiApi = AiApi()
}
