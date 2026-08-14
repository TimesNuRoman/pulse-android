/*
 * WikiLinkExtractor — finds `[[wiki links]]` in markdown source.
 * A wiki link is two opening brackets, a non-empty title (no newline), and two closing
 * brackets. The title is what we use to match against note titles (case-insensitive).
 *
 * Examples (matched):
 *   [[Welcome to Pulse]]
 *   [[Project: Pulse web (sync preview)]]
 *
 * Not matched (negative cases):
 *   [[  ]]            (empty title)
 *   [[unterminated    (no closing brackets)
 *   [[multi\nline]]   (newlines break the match)
 */
package com.pulse.android.util

object WikiLinkExtractor {
    private val pattern = Regex("""\[\[([^\[\]\n]+?)\]\]""")

    fun extract(body: String): List<String> =
        pattern.findAll(body).map { it.groupValues[1].trim() }.toList()

    fun contains(body: String, title: String): Boolean =
        extract(body).any { it.equals(title, ignoreCase = true) }
}
