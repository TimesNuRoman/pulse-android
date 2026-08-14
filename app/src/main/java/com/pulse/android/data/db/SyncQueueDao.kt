/*
 * SyncQueueDao — outbound queue. SyncWorker drains in createdAt order; failed
 * items are bumped (`attempts++`, `lastError*`) and re-tried on the next round.
 */
package com.pulse.android.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.pulse.android.data.model.SyncQueueItem
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncQueueDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(item: SyncQueueItem)

    @Query("SELECT * FROM sync_queue ORDER BY createdAt ASC LIMIT 200")
    suspend fun head(): List<SyncQueueItem>

    @Query("SELECT COUNT(*) FROM sync_queue")
    fun observePendingCount(): Flow<Int>

    @Query("DELETE FROM sync_queue WHERE id = :id")
    suspend fun remove(id: String)

    @Query("UPDATE sync_queue SET attempts = attempts + 1, lastErrorAt = :now, lastError = :err WHERE id = :id")
    suspend fun markFailure(id: String, now: Long, err: String?)
}
