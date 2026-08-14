/*
 * AppDataStore — single source of truth for app preferences.
 *
 * DataStore's `preferencesDataStore` delegate is a *singleton-per-property-name*:
 * declaring it twice (even in two different files) creates two `DataStore` instances
 * pointing to the same backing file, which AndroidX treats as a corruption hazard
 * and throws `IllegalStateException: There are multiple DataStores active for the
 * same file`.
 *
 * Therefore this file owns THE ONLY `preferencesDataStore("pulse_prefs")` call site
 * in the app. Every ViewModel / repository that needs prefs imports this extension
 * and never declares its own.
 */
package com.pulse.android.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.preferencesDataStore

/** The single DataStore<Preferences> for the app. `private` so nothing else can re-declare it. */
private val Context.appDataStore by preferencesDataStore(name = "pulse_prefs")

/** Public read/write extension so call sites can do `context.appDataStore.data` / `.edit`. */
val Context.prefs get() = appDataStore

/**
 * A SECOND DataStore, scoped to the signup-draft form. Different filename →
 * no collision with `pulse_prefs`.
 *
 * Note: the property name (`signupDraft`) matters — declaring two
 * `preferencesDataStore` calls with the same name is the failure mode we
 * explicitly avoid. Keep names unique.
 */
private val Context.signupDraft by preferencesDataStore(name = "pulse_signup_draft")

/** Read-only handle so the SignupViewModel can persist + clear its draft. */
val Context.signupDraftPrefs get() = signupDraft

/** Key catalog. Import the one you need. */
object PrefKeys {
    val OnboardingDone = booleanPreferencesKey("onboarding_done_v1")
    val SyncEnabled = booleanPreferencesKey("sync_enabled")
    val VoiceEnabled = booleanPreferencesKey("voice_enabled")
}

object SignupDraftKeys {
    val Name = androidx.datastore.preferences.core.stringPreferencesKey("name")
    val Email = androidx.datastore.preferences.core.stringPreferencesKey("email")
}
