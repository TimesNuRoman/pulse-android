/*
 * WebSearch — DuckDuckGo HTML scraper, no API key, no tracking.
 *
 * Mirrors the desktop `data/web/WebSearch.kt` shape:
 *   search(query) returns up to N SearchResult
 *   formatForLlm(results, query) returns a numbered prefix the LLM
 *     can cite as [1], [2], etc.
 *
 * Android adaptation: HttpURLConnection (no OkHttp dep needed),
 * Dispatchers.IO via kotlinx.coroutines, plain regex parsing.
 */
package com.pulse.android.data.web

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

data class SearchResult(
    val title: String,
    val url: String,
    val snippet: String,
)

@Singleton
class WebSearch @Inject constructor() {

    suspend fun search(query: String, maxResults: Int = 5): List<SearchResult> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        try {
            val html = fetchHtml(query)
            parseResults(html, maxResults)
        } catch (t: Throwable) {
            emptyList()
        }
    }

    fun formatForLlm(results: List<SearchResult>, query: String): String {
        if (results.isEmpty()) return ""
        val sb = StringBuilder("Web search results for \"$query\":\n")
        results.forEachIndexed { i, r ->
            sb.append("[").append(i + 1).append("] ").append(r.title).append('\n')
            sb.append("    ").append(r.url).append('\n')
            if (r.snippet.isNotBlank()) sb.append("    ").append(r.snippet).append('\n')
        }
        sb.append("\nUse these to inform your answer. Cite as [1], [2], etc.")
        return sb.toString()
    }

    private fun fetchHtml(query: String): String {
        val encoded = URLEncoder.encode(query, "UTF-8")
        val body = "q=$encoded&kl=us-en"
        val conn = URL("https://html.duckduckgo.com/html/").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 Pulse/1.0 (android; +https://ownlocalml.com)")
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml")
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            throw RuntimeException("DuckDuckGo HTTP $code")
        }
        val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        conn.disconnect()
        return text
    }

    private fun parseResults(html: String, maxResults: Int): List<SearchResult> {
        val results = mutableListOf<SearchResult>()
        val linkRx = Regex(
            """<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )
        val snippetRx = Regex(
            """<a[^>]+class="result__snippet"[^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )
        val titles = linkRx.findAll(html).toList()
        val snippets = snippetRx.findAll(html).toList()
        for (i in 0 until minOf(titles.size, maxResults)) {
            val title = stripHtml(titles[i].groupValues[2]).trim()
            var url = decodeUrl(titles[i].groupValues[1])
            val snippet = if (i < snippets.size) stripHtml(snippets[i].groupValues[1]).trim() else ""
            if (title.isNotEmpty() && url.isNotEmpty()) {
                results.add(SearchResult(title, url, snippet))
            }
        }
        return results
    }

    private fun stripHtml(s: String): String {
        var out = s.replace(Regex("<[^>]+>"), "")
        out = out.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&nbsp;", " ")
        return out
    }

    private fun decodeUrl(raw: String): String = when {
        raw.contains("uddg=") -> {
            val m = Regex("uddg=([^&]+)").find(raw)
            val encoded = m?.groupValues?.get(1) ?: return raw
            java.net.URLDecoder.decode(encoded, "UTF-8")
        }
        raw.startsWith("//") -> "https:$raw"
        else -> raw
    }
}
