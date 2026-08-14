/*
 * SkillRepository — JSON-backed CRUD for skills, persisted to
 * <filesDir>/skills.json. Matches the desktop repo's wire shape so the
 * two sides can stay in sync.
 *
 * On first run we seed two example skills (code review + summarize) so
 * the user sees what triggers look like. Mutex-guarded writes + atomic
 * rename keep the file crash-safe.
 */
package com.pulse.android.data.skills

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SkillRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val file: File by lazy { File(context.filesDir, "skills.json") }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val writeMutex = Mutex()

    private val _skills = MutableStateFlow<List<Skill>>(emptyList())
    val skills: StateFlow<List<Skill>> = _skills.asStateFlow()

    init {
        scope.launch { load() }
    }

    fun upsert(skill: Skill) {
        val now = _skills.value.toMutableList()
        val idx = now.indexOfFirst { it.id == skill.id }
        if (idx >= 0) now[idx] = skill else now.add(skill)
        commit(now)
    }

    fun delete(id: String) {
        commit(_skills.value.filter { it.id != id })
    }

    fun recordUse(id: String) {
        val now = _skills.value.toMutableList()
        val idx = now.indexOfFirst { it.id == id }
        if (idx < 0) return
        now[idx] = now[idx].copy(uses = now[idx].uses + 1)
        commit(now)
    }

    fun recordAcceptance(id: String, accepted: Boolean) {
        val now = _skills.value.toMutableList()
        val idx = now.indexOfFirst { it.id == id }
        if (idx < 0) return
        val s = now[idx]
        now[idx] = s.copy(accepted = s.accepted + if (accepted) 1 else 0)
        commit(now)
    }

    fun matching(message: String): List<Skill> {
        val lower = message.lowercase()
        return _skills.value
            .filter { s -> s.triggers.any { triggerMatches(it, lower) } }
            .sortedWith(
                compareByDescending<Skill> { it.pinned }
                    .thenByDescending { it.acceptRate() ?: 0.0 }
                    .thenByDescending { it.uses }
            )
    }

    private fun triggerMatches(trigger: String, lowerMessage: String): Boolean {
        val t = trigger.trim()
        if (t.isEmpty()) return false
        return when {
            t.startsWith("/") && t.endsWith("/") && t.length > 2 -> {
                val pattern = t.substring(1, t.length - 1)
                runCatching { Regex(pattern, RegexOption.IGNORE_CASE).containsMatchIn(lowerMessage) }.getOrDefault(false)
            }
            t.startsWith("\"") && t.endsWith("\"") && t.length > 2 -> {
                lowerMessage.contains(t.substring(1, t.length - 1).lowercase())
            }
            t.startsWith("!") -> {
                val tag = t.substring(1).lowercase()
                lowerMessage.contains("tag:$tag") || lowerMessage.contains("[$tag]")
            }
            else -> lowerMessage.contains(t.lowercase())
        }
    }

    private fun commit(newList: List<Skill>) {
        _skills.value = newList
        scope.launch { persist(newList) }
    }

    private suspend fun load() = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            val seeded = listOf(
                Skill(
                    name = "Code review",
                    description = "Reviews diffs and points out bugs, perf issues, and style nits.",
                    body = "You are a senior engineer doing a code review. Be terse. For each finding give: line, severity, fix.",
                    triggers = listOf("review", "code", "/class \\w+/"),
                    category = "Coding",
                    pinned = true,
                ),
                Skill(
                    name = "Summarize",
                    description = "TL;DRs long text into 3 bullets + 1 sentence.",
                    body = "Summarize the user's input in 3 bullet points and 1 sentence.",
                    triggers = listOf("summarize", "tl;dr", "tl dr"),
                    category = "Writing",
                ),
            )
            commit(seeded)
            return@withContext
        }
        runCatching {
            val text = file.readText(Charsets.UTF_8)
            _skills.value = decode(text)
        }
    }

    private suspend fun persist(list: List<Skill>) = withContext(Dispatchers.IO) {
        writeMutex.withLock {
            runCatching {
                val tmp = File(file.parentFile, "skills.json.tmp")
                tmp.writeText(encode(list), Charsets.UTF_8)
                if (file.exists()) file.delete()
                tmp.renameTo(file)
            }
        }
    }

    // ---- JSON ----

    private fun encode(list: List<Skill>): String {
        val arr = JSONArray()
        list.forEach { arr.put(encodeSkill(it)) }
        return arr.toString()
    }

    private fun encodeSkill(s: Skill): JSONObject = JSONObject().apply {
        put("id", s.id)
        put("name", s.name)
        put("description", s.description)
        put("body", s.body)
        put("triggers", JSONArray(s.triggers))
        put("category", s.category)
        put("pinned", s.pinned)
        put("uses", s.uses)
        put("accepted", s.accepted)
        put("createdAt", s.createdAt)
    }

    private fun decode(text: String): List<Skill> {
        val arr = JSONArray(text)
        return (0 until arr.length()).map { idx -> decodeSkill(arr.getJSONObject(idx)) }
    }

    private fun decodeSkill(o: JSONObject): Skill = Skill(
        id = o.optString("id", java.util.UUID.randomUUID().toString()),
        name = o.optString("name", "Untitled"),
        description = o.optString("description", ""),
        body = o.optString("body", ""),
        triggers = o.optJSONArray("triggers")?.let { arr ->
            (0 until arr.length()).map { arr.getString(it) }
        } ?: emptyList(),
        category = o.optString("category", "General"),
        pinned = o.optBoolean("pinned", false),
        uses = o.optInt("uses", 0),
        accepted = o.optInt("accepted", 0),
        createdAt = o.optLong("createdAt", System.currentTimeMillis()),
    )
}
