/*
 * ChatViewModel — drives the chat screen (now "AI chat" with PRO features).
 *
 *   - Holds the current conversation id
 *   - Sends user messages to either the local LLM (LlamaEngine / JNI) or the
 *     server (AiApi.streamChat) depending on the selected model
 *   - License-aware: pro models are blocked for non-pro users
 *   - Pulls the top-5 most relevant notes as RAG context
 *   - Persists every turn via ChatRepository
 *   - Tracks usage (neurons used / limit) and surfaces in the UI
 */
package com.pulse.android.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.api.AiApi
import com.pulse.android.data.api.AiError
import com.pulse.android.data.api.ModelInfo
import com.pulse.android.data.api.UsageInfo
import com.pulse.android.data.auth.AuthRepository
import com.pulse.android.data.auth.LicenseRepository
import com.pulse.android.data.auth.LicenseState
import com.pulse.android.data.auth.models.User
import com.pulse.android.data.llm.LlamaEngine
import com.pulse.android.data.model.ChatMessage
import com.pulse.android.data.repo.ChatRepository
import com.pulse.android.data.repo.NoteRepository
import com.pulse.android.data.skills.SkillRepository
import com.pulse.android.data.update.UpdateChecker
import com.pulse.android.data.update.UpdateStatus
import com.pulse.android.data.web.WebSearch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The model the user has chosen in the selector.
 * `auto` is a special sentinel: pick the best available (local > 8B > 70B).
 */
enum class ChatModel(val id: String, val label: String) {
    Auto("auto", "Auto"),
    LocalGemma3("local-gemma3-4b", "Local · 4B"),
    ServerLlama8B("server-llama-3.1-8b", "Cloud · 8B"),
    ServerLlama70B("server-llama-3.3-70b", "Cloud · 70B (PRO)");

    companion object {
        fun fromId(id: String?): ChatModel = entries.firstOrNull { it.id == id } ?: Auto
    }
}

data class ChatUiState(
    val conversationId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val model: ChatModel = ChatModel.Auto,
    val modelConnected: Boolean = false,
    val isGenerating: Boolean = false,
    val drawerOpen: Boolean = false,
    val history: List<com.pulse.android.data.model.Conversation> = emptyList(),
    val license: LicenseState = LicenseState(),
    val usage: UsageInfo? = null,
    val availableModels: List<ModelInfo> = emptyList(),
    val licenseBanner: LicenseBanner? = null,
    val transientError: String? = null,
    val webSearchOn: Boolean = false,
    val updateStatus: UpdateStatus = UpdateStatus.Idle,
)

/**
 * Surfaced to the UI when the user attempts to send with a setup we don't allow
 * (e.g. trying to use a pro model while on the free tier).
 */
sealed class LicenseBanner {
    object ProRequired : LicenseBanner()
    object ProExpired : LicenseBanner()
    object LocalUnavailable : LicenseBanner()
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepo: ChatRepository,
    private val noteRepo: NoteRepository,
    private val llama: LlamaEngine,
    private val aiApi: AiApi,
    private val authRepo: AuthRepository,
    private val licenseRepo: LicenseRepository,
    private val skillRepo: SkillRepository,
    private val webSearch: WebSearch,
    private val updateChecker: UpdateChecker,
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state = _state.asStateFlow()

    private var generateJob: Job? = null

    init {
        // History
        viewModelScope.launch {
            chatRepo.observeConversations().collect { convs ->
                _state.update { it.copy(history = convs) }
            }
        }
        // Open or create a conversation
        viewModelScope.launch {
            val last = chatRepo.lastConversationId()
            val conv = if (last != null) chatRepo.getConversation(last) else null
            if (conv != null) {
                openConversation(conv.id)
            } else {
                val new = chatRepo.newConversation(model = _state.value.model.id)
                openConversation(new.id)
            }
        }
        // License + models combined
        viewModelScope.launch {
            combine(licenseRepo.state, authRepo.sessionState) { license, session ->
                license to session?.let {
                    User(
                        id = it.userId,
                        email = it.email,
                        name = it.email.substringBefore("@"),
                        emailVerified = true,
                        tier = license.tier,
                    )
                }
            }.collect { (license, user) ->
                val models = aiApi.listModels(user)
                _state.update {
                    it.copy(
                        license = license,
                        availableModels = models,
                    )
                }
            }
        }
        // Update check: poll the JSON manifest 5s after init, expose
        // status so the topbar can render the update pill.
        viewModelScope.launch {
            kotlinx.coroutines.delay(5_000)
            _state.update { it.copy(updateStatus = UpdateStatus.Checking) }
            _state.update { it.copy(updateStatus = updateChecker.check()) }
        }
    }

    fun openUpdate() {
        val info = (_state.value.updateStatus as? UpdateStatus.Available)?.info ?: return
        updateChecker.openDownload(info.url)
    }

    fun setInput(s: String) { _state.update { it.copy(input = s) } }

    fun openConversation(id: String) {
        _state.update { it.copy(conversationId = id, drawerOpen = false) }
        viewModelScope.launch {
            chatRepo.observeMessages(id).collect { msgs ->
                _state.update { it.copy(messages = msgs) }
            }
        }
    }

    fun toggleDrawer(open: Boolean? = null) {
        _state.update { it.copy(drawerOpen = open ?: !it.drawerOpen) }
    }

    fun newChat() {
        viewModelScope.launch {
            val conv = chatRepo.newConversation(model = _state.value.model.id)
            openConversation(conv.id)
        }
    }

    fun clearHistory() {
        val id = _state.value.conversationId ?: return
        viewModelScope.launch { chatRepo.clearHistory(id) }
    }

    fun switchModel(m: ChatModel) {
        _state.update { it.copy(model = m) }
    }

    fun dismissLicenseBanner() {
        _state.update { it.copy(licenseBanner = null) }
    }

    fun consumeError() { _state.update { it.copy(transientError = null) } }

    fun toggleWebSearch(on: Boolean) { _state.update { it.copy(webSearchOn = on) } }

    /**
     * Resolve the "auto" sentinel to a concrete model given current license + native state.
     */
    private fun resolveAutoModel(): ChatModel {
        val s = _state.value
        return when {
            !s.license.isPro && llama.isNativeReady -> ChatModel.LocalGemma3
            !s.license.isPro -> ChatModel.ServerLlama8B
            llama.isNativeReady -> ChatModel.LocalGemma3
            s.license.isPro -> ChatModel.ServerLlama70B
            else -> ChatModel.ServerLlama8B
        }
    }

    fun send() {
        val s = _state.value
        if (s.input.isBlank() || s.conversationId == null) return
        val convId = s.conversationId
        val userText = s.input.trim()

        // Resolve effective model (auto → concrete)
        val effective = if (s.model == ChatModel.Auto) resolveAutoModel() else s.model
        // License gate (server-side will re-check; this is the UX gate)
        if (effective == ChatModel.ServerLlama70B && !s.license.isPro) {
            _state.update { it.copy(licenseBanner = LicenseBanner.ProRequired) }
            return
        }
        if (effective == ChatModel.LocalGemma3 && !llama.isNativeReady) {
            _state.update { it.copy(licenseBanner = LicenseBanner.LocalUnavailable) }
            return
        }

        _state.update { it.copy(input = "", isGenerating = true, licenseBanner = null) }
        viewModelScope.launch {
            chatRepo.append(convId, role = "user", content = userText)

            // RAG: top 5 notes by FTS
            val ctx = noteRepo.search(userText)
                .take(5)
                .joinToString("\n\n") { "### ${it.title}\n${it.body.take(800)}" }

            // Skills: match triggers on the user message; inject triggered
            // skill bodies as additional system context.
            val triggered = skillRepo.matching(userText)
            if (triggered.isNotEmpty()) {
                triggered.forEach { skillRepo.recordUse(it.id) }
            }
            val skillsCtx = triggered.joinToString("\n\n") { "--- ${it.name} ---\n${it.body}" }

            // Web search (optional): when toggle is on, run a DDG search and
            // append the snippet context. Skipped if toggle is off.
            val webCtx = if (_state.value.webSearchOn) {
                val results = webSearch.search(userText)
                if (results.isNotEmpty()) webSearch.formatForLlm(results, userText) else ""
            } else ""

            val sysPrompt = buildString {
                append("You are Pulse, a local assistant that answers questions about the user's notes. ")
                append("If the answer is in the notes, cite them as [[Note Title]]. Be concise.\n\n")
                if (ctx.isNotBlank()) append("Notes context:\n$ctx\n\n")
                if (skillsCtx.isNotBlank()) append("Skills context:\n$skillsCtx\n\n")
                if (webCtx.isNotBlank()) append("Web search:\n$webCtx\n")
            }

            // Persist empty assistant msg
            chatRepo.append(convId, role = "assistant", content = "", model = effective.id)
            val sb = StringBuilder()

            generateJob = launch {
                try {
                    when (effective) {
                        ChatModel.LocalGemma3 -> streamLocal(convId, sysPrompt, userText, sb)
                        ChatModel.ServerLlama8B, ChatModel.ServerLlama70B -> streamServer(convId, effective, sysPrompt, userText, sb)
                        ChatModel.Auto -> Unit // already resolved
                    }
                } catch (e: Exception) {
                    sb.append("\n[error] ${e.message}")
                }
                chatRepo.append(convId, role = "assistant", content = sb.toString(), model = effective.id)
                _state.update { it.copy(isGenerating = false) }
                refreshUsage()
            }
        }
    }

    private suspend fun streamLocal(convId: String, sysPrompt: String, userText: String, sb: StringBuilder) {
        val fullPrompt = "$sysPrompt\nUser: $userText\nAssistant:"
        if (!llama.isNativeReady) {
            sb.append("(Local model not yet loaded — open Settings → Model to download.)")
            return
        }
        try {
            llama.generate(fullPrompt).collect { token -> appendToken(convId, sb, token) }
        } catch (e: Exception) {
            sb.append("\n[error] ${e.message}")
        }
    }

    private suspend fun streamServer(
        convId: String,
        model: ChatModel,
        sysPrompt: String,
        userText: String,
        sb: StringBuilder,
    ) {
        val token = authRepo.sessionState.value?.sessionToken
        val messages = listOf("system" to sysPrompt, "user" to userText)
        try {
            aiApi.streamChat(
                model = model.id,
                messages = messages,
                token = token,
            ).collect { delta ->
                if (delta == "[DONE]") return@collect
                if (delta.startsWith("[BLOCKED]")) {
                    // Server told us to stop (pro model, non-pro user).
                    sb.append("\n$delta")
                    _state.update { it.copy(licenseBanner = LicenseBanner.ProRequired) }
                    return@collect
                }
                appendToken(convId, sb, delta)
            }
        } catch (e: Exception) {
            sb.append("\n[error] ${e.message}")
        }
    }

    private fun appendToken(convId: String, sb: StringBuilder, token: String) {
        sb.append(token)
        // The "current" assistant message is the last one with empty content (we
        // appended a placeholder right before kicking off the stream).
        _state.update { st ->
            st.copy(messages = st.messages.mapIndexed { idx, m ->
                if (idx == st.messages.lastIndex && m.role == "assistant") {
                    m.copy(content = sb.toString())
                } else m
            })
        }
    }

    fun stop() {
        generateJob?.cancel()
        _state.update { it.copy(isGenerating = false) }
    }

    fun refreshLicense() {
        viewModelScope.launch { licenseRepo.refresh() }
    }

    private fun refreshUsage() {
        viewModelScope.launch {
            val token = authRepo.sessionState.value?.sessionToken
            val usage = aiApi.getUsage(token)
            _state.update { it.copy(usage = usage) }
        }
    }
}
