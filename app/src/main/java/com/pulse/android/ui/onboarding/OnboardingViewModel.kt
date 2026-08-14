/*
 * OnboardingViewModel — tracks the active card + the "completed" flag in DataStore.
 *
 * The DataStore extension lives in [com.pulse.android.data.prefs] (singleton-per-name).
 * Do NOT redeclare it here — that throws `multiple DataStores active for the same file`.
 */
package com.pulse.android.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.prefs.PrefKeys
import com.pulse.android.data.prefs.prefs
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import android.content.Context
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _card = MutableStateFlow(0)
    val card = _card.asStateFlow()

    val isDone = context.prefs.data.map { it[PrefKeys.OnboardingDone] ?: false }

    fun next() { _card.value = (_card.value + 1).coerceAtMost(2) }
    fun back() { _card.value = (_card.value - 1).coerceAtLeast(0) }

    fun skip(onDone: () -> Unit) {
        viewModelScope.launch { markDone() }
        onDone()
    }

    fun finish(onDone: () -> Unit) {
        viewModelScope.launch { markDone() }
        onDone()
    }

    private suspend fun markDone() {
        context.prefs.edit { it[PrefKeys.OnboardingDone] = true }
    }
}
