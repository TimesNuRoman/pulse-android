/*
 * Skill — saved prompt the user can drop into any chat.
 *
 * Mirrors the desktop `data/skills/Skill.kt` shape (R140 parity). Triggers are
 * matched on the user message before streamReply; matched skills prepend their
 * body to the LLM prompt as system context. Accept-rate tracks how often the
 * user votes a result in/out.
 */
package com.pulse.android.data.skills

import java.util.UUID

data class Skill(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val description: String = "",
    val body: String,
    val triggers: List<String> = emptyList(),
    val category: String = "General",
    val pinned: Boolean = false,
    val uses: Int = 0,
    val accepted: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
)

fun Skill.acceptRate(): Double? =
    if (uses <= 0) null else accepted.toDouble() / uses.toDouble()
