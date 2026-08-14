/*
 * SettingsViewModel — reads/writes user preferences to DataStore.
 *
 * v1 is dark-only so Theme has no toggle; it's a placeholder row.
 *
 * DataStore extension lives in [com.pulse.android.data.prefs] (singleton-per-name).
 */
package com.pulse.android.ui.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.prefs.PrefKeys
import com.pulse.android.data.prefs.prefs
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsState(
    val syncEnabled: Boolean = true,
    val voiceEnabled: Boolean = true,
    val proAnnual: Boolean = false,
    val proRenewsAt: String? = null,
    val accountName: String = "Anya",
    val accountEmail: String = "anya@mail.com",
    val version: String = "0.1.0",
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val state: StateFlow<SettingsState> = context.prefs.data
        .map {
            SettingsState(
                syncEnabled = it[PrefKeys.SyncEnabled] ?: true,
                voiceEnabled = it[PrefKeys.VoiceEnabled] ?: true,
                proAnnual = false,
                proRenewsAt = null,
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsState())

    fun setSync(enabled: Boolean) {
        viewModelScope.launch { context.prefs.edit { it[PrefKeys.SyncEnabled] = enabled } }
    }

    fun setVoice(enabled: Boolean) {
        viewModelScope.launch { context.prefs.edit { it[PrefKeys.VoiceEnabled] = enabled } }
    }
}
