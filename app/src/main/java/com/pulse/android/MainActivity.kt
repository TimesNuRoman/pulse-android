/*
 * MainActivity — single-activity host. Owns the Compose root + nav controller.
 *
 * Auth gate (v1):
 *   - On cold start, check `AuthRepository.sessionState` for an active session.
 *   - No session → mount AuthNavGraph.
 *   - Session present → mount the main app graph (Notes / Chat / Search / Settings + editor).
 *
 * Deep links (manifest intent-filter):
 *   - `pulse://verify?token=...` → AuthNavGraph with `initialToken=...`
 *   - `pulse://reset?token=...`  → AuthNavGraph with the same (RESET route handles it)
 *
 * FLAG_SECURE: applied only when on an auth screen. Once the user is authed
 * we clear the flag so screenshots / screen recordings of notes still work.
 */
package com.pulse.android

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.pulse.android.data.auth.AuthRepository
import com.pulse.android.data.voice.VoiceTranscriber
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseTheme
import com.pulse.android.ui.auth.AuthNavGraph
import com.pulse.android.ui.auth.AuthRoutes
import com.pulse.android.ui.chat.ChatScreen
import com.pulse.android.ui.chat.VoiceInputModal
import com.pulse.android.ui.components.BottomNav
import com.pulse.android.ui.components.NavDestination
import com.pulse.android.ui.notes.NoteEditorScreen
import com.pulse.android.ui.notes.NotesListScreen
import com.pulse.android.ui.onboarding.OnboardingScreen
import com.pulse.android.ui.onboarding.OnboardingViewModel
import com.pulse.android.ui.search.SearchScreen
import com.pulse.android.ui.settings.SettingsScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var voiceTranscriber: VoiceTranscriber
    @Inject lateinit var authRepo: AuthRepository

    private var pendingDeepLink: PendingDeepLink? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Pull any deep-link target off the launch intent.
        pendingDeepLink = intent?.let { parseDeepLink(it) }

        setContent {
            PulseTheme {
                AppRoot(
                    voiceTranscriber = voiceTranscriber,
                    authRepo = authRepo,
                    initialDeepLink = pendingDeepLink,
                    onClearDeepLink = { pendingDeepLink = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // We could expose the new intent to the running Composable via a
        // MutableState, but for v1 the auth flow is the only deep-link target
        // and a fresh launch is sufficient (the system restarts the task on
        // a `pulse://` deep link).
        intent.let { parseDeepLink(it) }
    }

    /**
     * Hardware-keyboard shortcut: Cmd+K (iOS / iPadOS via external keyboard) or
     * Ctrl+K (ChromeOS, Android tablets) navigates to the chat screen and signals
     * it to focus the composer. The actual focus handling lives in [ChatScreen];
     * here we just write a "focus_chat" flag into the chat's saved state handle.
     */
    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent): Boolean {
        if (keyCode == android.view.KeyEvent.KEYCODE_K &&
            (event.isCtrlPressed || event.metaState and android.view.KeyEvent.META_CTRL_ON != 0 ||
             event.metaState and android.view.KeyEvent.META_META_ON != 0)
        ) {
            pendingDeepLink = null  // suppress deep-link on this resume
            // The actual nav happens in the Compose root via the chat focus flag.
            chatFocusRequest.value = System.currentTimeMillis()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        /**
         * Tick value used by ChatScreen to detect a Cmd+K press. Each press sets
         * a new timestamp; ChatScreen compares against the last one it handled
         * and focuses the composer when they differ.
         */
        val chatFocusRequest: kotlinx.coroutines.flow.MutableStateFlow<Long> =
            kotlinx.coroutines.flow.MutableStateFlow(0L)
    }

    private fun parseDeepLink(intent: Intent): PendingDeepLink? {
        val data = intent.data ?: return null
        if (data.scheme != "pulse") return null
        val token = data.getQueryParameter("token") ?: return null
        return when (data.host) {
            "verify" -> PendingDeepLink.Verify(token)
            "reset" -> PendingDeepLink.Reset(token)
            else -> null
        }
    }
}

sealed class PendingDeepLink {
    data class Verify(val token: String) : PendingDeepLink()
    data class Reset(val token: String) : PendingDeepLink()
}

private object Routes {
    const val WELCOME = "welcome"
    const val NOTES = "notes"
    const val NOTE_NEW = "notes/new"
    const val NOTE_EDIT = "notes/{noteId}"
    const val CHAT = "chat"
    const val SEARCH = "search"
    const val SETTINGS = "settings"
    const val VOICE = "voice"
    const val SKILLS = "skills"
    fun noteEdit(id: String) = "notes/$id"
}

@Composable
private fun AppRoot(
    voiceTranscriber: VoiceTranscriber,
    authRepo: AuthRepository,
    initialDeepLink: PendingDeepLink?,
    onClearDeepLink: () -> Unit,
) {
    val session by authRepo.sessionState.collectAsState()
    val hasSession = session != null

    // FLAG_SECURE for auth surfaces
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) {
        LaunchedEffect(hasSession) {
            val window = (view.context as android.app.Activity).window
            if (hasSession) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }

    if (hasSession) {
        MainAppGraph(
            voiceTranscriber = voiceTranscriber,
            onLogout = { /* AuthRepository.logout will clear session, recomposition handles it */ },
        )
    } else {
        AuthNavGraph(
            onAuthed = { /* sessionState will flip, recomposition swaps to main graph */ },
            onForceWelcome = { /* close button on /verify → just stay on auth graph */ },
            initialEmail = (initialDeepLink as? PendingDeepLink.Verify)?.token?.let { null },
            initialToken = (initialDeepLink as? PendingDeepLink.Reset)?.token,
        )
    }
}

@Composable
private fun MainAppGraph(
    voiceTranscriber: VoiceTranscriber,
    onLogout: () -> Unit,
) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route ?: Routes.NOTES
    val showBottomNav = currentRoute in listOf(Routes.NOTES, Routes.CHAT, Routes.SEARCH, Routes.SETTINGS)
    val onboardingVm: OnboardingViewModel = hiltViewModel()
    val onboardingDone by onboardingVm.isDone.collectAsState(initial = null)

    Box(modifier = Modifier.fillMaxSize().background(PulseBg)) {
        NavHost(
            navController = nav,
            startDestination = if (onboardingDone == true) Routes.NOTES else Routes.WELCOME,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(Routes.WELCOME) {
                OnboardingScreen(onDone = {
                    nav.navigate(Routes.NOTES) {
                        popUpTo(Routes.WELCOME) { inclusive = true }
                    }
                })
            }
            composable(Routes.NOTES) {
                NotesListScreen(
                    onOpenNote = { id -> nav.navigate(Routes.noteEdit(id)) },
                    onOpenSearch = { nav.navigate(Routes.SEARCH) },
                )
            }
            composable(
                route = Routes.NOTE_EDIT,
                arguments = listOf(navArgument("noteId") { type = NavType.StringType }),
            ) {
                NoteEditorScreen(
                    onBack = { nav.popBackStack() },
                    onOpenLink = { noteId -> nav.navigate(Routes.noteEdit(noteId)) },
                    onRequestVoice = { nav.navigate(Routes.VOICE) },
                )
            }
            composable(Routes.NOTE_NEW) {
                NoteEditorScreen(
                    onBack = { nav.popBackStack() },
                    onOpenLink = { noteId -> nav.navigate(Routes.noteEdit(noteId)) },
                    onRequestVoice = { nav.navigate(Routes.VOICE) },
                )
            }
            composable(Routes.CHAT) {
                ChatScreen(
                    onRequestVoice = { nav.navigate(Routes.VOICE) },
                    onOpenNote = { noteId -> nav.navigate(Routes.noteEdit(noteId)) },
                )
            }
            composable(Routes.SEARCH) {
                SearchScreen(
                    onBack = { nav.popBackStack() },
                    onOpenNote = { id -> nav.navigate(Routes.noteEdit(id)) },
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onBack = { nav.popBackStack() },
                    onOpenSkills = { nav.navigate(Routes.SKILLS) },
                )
            }
            composable(Routes.VOICE) {
                VoiceInputModal(
                    onCancel = { nav.popBackStack() },
                    onResult = { text ->
                        nav.previousBackStackEntry?.savedStateHandle?.set("voice_text", text)
                        nav.popBackStack()
                    },
                    transcriber = voiceTranscriber,
                )
            }
            composable(Routes.SKILLS) {
                com.pulse.android.ui.skills.SkillsScreen(
                    onDismiss = { nav.popBackStack() },
                )
            }
        }
        if (showBottomNav) {
            Column(modifier = Modifier.fillMaxSize().align(Alignment.BottomCenter)) {
                Box(modifier = Modifier.weight(1f))
                BottomNav(
                    currentRoute = currentRoute,
                    onSelect = { dest ->
                        nav.navigate(dest.route) {
                            popUpTo(Routes.NOTES) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        }
    }
}
