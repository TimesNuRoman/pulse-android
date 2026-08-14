/*
 * MarkdownRenderer — converts a markdown source string to a Compose-renderable tree.
 *
 * We use the commonmark-java library for parsing (battle-tested, MIT) and project
 * the AST into a sealed list of [Block]s. The editor renders the source as plain
 * monospace text in "source" mode and a subset of formatted output in "preview" mode:
 *   - headings (#, ##, ###)
 *   - bold / italic
 *   - inline code (rendered as a chip on the primary tint)
 *   - code blocks (fenced ```)
 *   - checkboxes (- [ ], - [x])
 *   - paragraphs
 *   - [[wiki links]] rendered as primary-tinted chips
 *
 * Anything we don't render (tables, images, blockquotes in v1) is preserved as
 * a plain paragraph so the markdown source is not lost in the rendered view.
 */
package com.pulse.android.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Document
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Heading
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.parser.Parser
import org.commonmark.renderer.text.TextContentRenderer

object MarkdownRenderer {
    private val parser: Parser = Parser.builder().build()
    private val textRenderer: TextContentRenderer = TextContentRenderer.builder().build()

    /** Plain-text projection (used for editor source, copy-as-markdown, etc). */
    fun toPlainText(markdown: String): String {
        val doc = parser.parse(markdown)
        return textRenderer.render(doc).trim()
    }

    /** Parse and project to a flat list of [Block]s for Compose. */
    fun blocks(markdown: String): List<Block> {
        val doc: Document = parser.parse(markdown) as Document
        return projectDocument(doc)
    }

    private fun projectDocument(doc: Document): List<Block> {
        val out = mutableListOf<Block>()
        var child: Node? = doc.firstChild
        while (child != null) {
            projectNode(child, out)
            child = child.next
        }
        return out
    }

    private fun projectNode(node: Node, out: MutableList<Block>) {
        when (node) {
            is Heading -> {
                out += Block.Heading(level = node.level, text = textOf(node))
            }
            is Paragraph -> {
                out += Block.Paragraph(text = textOf(node))
            }
            is FencedCodeBlock -> {
                out += Block.CodeBlock(language = node.info ?: "", code = node.literal)
            }
            is IndentedCodeBlock -> {
                out += Block.CodeBlock(language = "", code = node.literal)
            }
            is BulletList -> {
                var item: Node? = node.firstChild
                while (item != null) {
                    if (item is ListItem) {
                        val checked = isCheckbox(item, checked = true)
                        val unchecked = isCheckbox(item, checked = false)
                        when {
                            checked -> out += Block.Checkbox(checked = true, text = textOf(item))
                            unchecked -> out += Block.Checkbox(checked = false, text = textOf(item))
                            else -> out += Block.Bullet(text = textOf(item))
                        }
                    }
                    item = item.next
                }
            }
            is OrderedList -> {
                var n = node.startNumber
                var item: Node? = node.firstChild
                while (item != null) {
                    if (item is ListItem) {
                        out += Block.Numbered(number = n++, text = textOf(item))
                    }
                    item = item.next
                }
            }
            is BlockQuote -> {
                out += Block.Quote(text = textOf(node))
            }
            is TableBlock -> {
                // v1: render as plain paragraph "table" so content isn't lost.
                out += Block.Paragraph(text = textOf(node))
            }
            else -> {
                // Unknown node — flat-text fallback.
                out += Block.Paragraph(text = textOf(node))
            }
        }
    }

    private fun isCheckbox(item: ListItem, checked: Boolean): Boolean {
        val first = item.firstChild
        if (first !is org.commonmark.node.Paragraph) return false
        val text = first.firstChild
        if (text !is Text) return false
        val literal = text.literal
        return if (checked) literal.startsWith("[x] ") || literal.startsWith("[X] ")
        else literal.startsWith("[ ] ")
    }

    private fun textOf(node: Node): String {
        val sb = StringBuilder()
        renderText(node, sb)
        return sb.toString().trim()
    }

    private fun renderText(node: Node, sb: StringBuilder) {
        var c: Node? = node.firstChild
        while (c != null) {
            when (c) {
                is Text -> sb.append(c.literal)
                is Code -> sb.append('`').append(c.literal).append('`')
                is StrongEmphasis -> { sb.append("**"); renderText(c, sb); sb.append("**") }
                is org.commonmark.node.Emphasis -> { sb.append('*'); renderText(c, sb); sb.append('*') }
                else -> renderText(c, sb)
            }
            c = c.next
        }
    }
}

sealed class Block {
    data class Heading(val level: Int, val text: String) : Block()
    data class Paragraph(val text: String) : Block()
    data class CodeBlock(val language: String, val code: String) : Block()
    data class Bullet(val text: String) : Block()
    data class Numbered(val number: Int, val text: String) : Block()
    data class Checkbox(val checked: Boolean, val text: String) : Block()
    data class Quote(val text: String) : Block()
}

/**
 * Highlight wiki links and primary-tint tokens inside an AnnotatedString. Pure helper
 * for use in the editor preview.
 */
@Composable
fun highlightedPreview(text: String): AnnotatedString = buildAnnotatedString {
    val primaryColor = com.pulse.android.theme.PulsePrimary
    val codeColor = com.pulse.android.theme.PulseAccent
    val bold = SpanStyle(fontWeight = FontWeight.Bold)
    val code = SpanStyle(
        fontFamily = FontFamily.Monospace,
        color = codeColor,
        fontSize = 13.sp,
    )
    // Pattern: [[title]] → wrap in primary color
    val wikiLink = Regex("""\[\[([^\[\]\n]+?)\]\]""")
    val inlineCode = Regex("""`([^`\n]+)`""")
    val boldPattern = Regex("""\*\*([^\*\n]+)\*\*""")

    var cursor = 0
    val matches = (wikiLink.findAll(text) + inlineCode.findAll(text) + boldPattern.findAll(text))
        .map { it to when (it.value.first()) {
            '[' -> 1
            '`' -> 2
            '*' -> 3
            else -> 0
        } }
        .sortedBy { it.first.range.first }
        .toList()
    for ((m, kind) in matches) {
        append(text.substring(cursor, m.range.first))
        val start = length
        append(m.value)
        when (kind) {
            1 -> addStyle(SpanStyle(color = primaryColor, fontWeight = FontWeight.Medium), start, length)
            2 -> addStyle(code, start, length)
            3 -> addStyle(bold, start, length)
        }
        cursor = m.range.last + 1
    }
    if (cursor < text.length) append(text.substring(cursor))
}
