/*
 * SkillsScreen — list + inline editor for Skills. Single-screen MVP: pin
 * section always present, accept-rate tooltip, triggers syntax help.
 *
 * Android Material 3 (Compose). No RoundedCornerShape, no light theme,
 * Tokyo Night palette, 48dp+ touch targets.
 */
package com.pulse.android.ui.skills

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.skills.Skill
import com.pulse.android.data.skills.acceptRate
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBg2
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulseBorderStrong
import com.pulse.android.theme.PulseGreen
import com.pulse.android.theme.PulseInputBg
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseYellow

/** Local alias to keep the body readable — maps to the per-token theme vals. */
private object PulseColors {
    val Bg = PulseBg
    val Bg2 = PulseBg2
    val Bg3 = PulseSurface2
    val Border = PulseBorder
    val BorderStrong = PulseBorderStrong
    val BgInput = PulseInputBg
    val Fg = PulseText
    val FgDim = PulseTextDim
    val FgDisabled = PulseTextDim
    val FgBright = PulseText
    val Accent = PulseAccent
    val AccentSoft = PulseAccent.copy(alpha = 0.20f)
    val Green = PulseGreen
    val Warn = PulseYellow
    val Error = com.pulse.android.theme.PulseRed
}

@Composable
fun SkillsScreen(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    vm: SkillsViewModel = hiltViewModel(),
) {
    val skills by vm.skills.collectAsState()
    var editing by remember { mutableStateOf<Skill?>(null) }
    var creatingNew by remember { mutableStateOf(false) }
    var helpOpen by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(PulseColors.Bg)
            .clickable { onDismiss() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .background(PulseColors.Bg2, RectangleShape)
                .border(1.dp, PulseColors.BorderStrong, RectangleShape)
                .clickable { /* eat clicks */ }
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .background(PulseColors.Bg, RectangleShape)
                    .border(1.dp, PulseColors.Border, RectangleShape)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Skills", color = PulseColors.FgBright, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text("${skills.size} total", color = PulseColors.FgDim, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = "Close",
                    tint = PulseColors.FgDim,
                    modifier = Modifier.size(20.dp).clickable { onDismiss() },
                )
            }

            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                // Left: list
                Column(
                    modifier = Modifier
                        .width(280.dp)
                        .fillMaxSize()
                        .background(PulseColors.Bg2)
                        .border(1.dp, PulseColors.Border, RectangleShape)
                        .verticalScroll(rememberScrollState())
                        .padding(8.dp),
                ) {
                    Text("PINNED", color = PulseColors.FgDim, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp))
                    val pinned = skills.filter { it.pinned }
                    if (pinned.isEmpty()) {
                        Text(
                            "No pinned skills. Pin a card to keep it on top.",
                            color = PulseColors.FgDisabled, fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    } else {
                        pinned.forEach { s ->
                            SkillListRow(s, isActive = s.id == editing?.id, onClick = { editing = s; creatingNew = false })
                        }
                    }
                    Row(Modifier.fillMaxWidth().height(1.dp).background(PulseColors.Border).padding(vertical = 4.dp)) {}
                    Text("ALL", color = PulseColors.FgDim, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp))
                    skills.filter { !it.pinned }.forEach { s ->
                        SkillListRow(s, isActive = s.id == editing?.id, onClick = { editing = s; creatingNew = false })
                    }
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .background(PulseColors.Accent, RectangleShape)
                            .border(1.dp, PulseColors.Accent, RectangleShape)
                            .clickable { creatingNew = true; editing = null },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("+ New skill", color = PulseColors.Bg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                // Right: editor
                val active = editing ?: if (creatingNew) Skill(name = "", body = "") else null
                if (active != null) {
                    Column(modifier = Modifier.weight(1f).fillMaxSize()) {
                        SkillEditor(
                            skill = active,
                            onSave = {
                                vm.upsert(it)
                                editing = it
                                creatingNew = false
                            },
                            onDelete = {
                                vm.delete(it.id)
                                editing = null
                                creatingNew = false
                            },
                            onCancel = { editing = null; creatingNew = false },
                            onShowHelp = { helpOpen = true },
                        )
                    }
                } else {
                    Box(modifier = Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Select a skill on the left, or click + New skill.", color = PulseColors.FgDim, fontSize = 13.sp)
                    }
                }
            }
        }

        if (helpOpen) {
            TriggersHelpOverlay(onDismiss = { helpOpen = false })
        }
    }
}

@Composable
private fun SkillListRow(s: Skill, isActive: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isActive) PulseColors.AccentSoft else PulseColors.Bg2, RectangleShape)
            .border(if (isActive) 1.dp else 0.dp, PulseColors.Accent, RectangleShape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(s.name, color = PulseColors.Fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            if (s.description.isNotBlank()) {
                Text(s.description.take(60), color = PulseColors.FgDim, fontSize = 11.sp, maxLines = 1)
            }
        }
        if (s.pinned) {
            Text("★", color = PulseColors.Accent, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ColumnScope.SkillEditor(
    skill: Skill,
    onSave: (Skill) -> Unit,
    onDelete: (Skill) -> Unit,
    onCancel: () -> Unit,
    onShowHelp: () -> Unit,
) {
    var name by remember(skill.id) { mutableStateOf(skill.name) }
    var description by remember(skill.id) { mutableStateOf(skill.description) }
    var body by remember(skill.id) { mutableStateOf(skill.body) }
    var triggersText by remember(skill.id) { mutableStateOf(skill.triggers.joinToString(", ")) }
    var category by remember(skill.id) { mutableStateOf(skill.category) }
    var pinned by remember(skill.id) { mutableStateOf(skill.pinned) }
    var showAcceptRateInfo by remember { mutableStateOf(false) }

    val canSave = name.isNotBlank() && body.isNotBlank()
    fun save() {
        if (!canSave) return
        val triggers = triggersText.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        onSave(skill.copy(name = name, description = description, body = body, triggers = triggers, category = category, pinned = pinned))
    }

    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (skill.id.isBlank() || skill.uses == 0) "New skill" else "Edit: ${skill.name}",
                color = PulseColors.FgBright, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier.height(48.dp)
                    .background(PulseColors.Bg3, RectangleShape)
                    .border(1.dp, PulseColors.Border, RectangleShape)
                    .clickable { onCancel() }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Cancel", color = PulseColors.Fg, fontSize = 12.sp) }
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier.height(48.dp)
                    .background(if (canSave) PulseColors.Accent else PulseColors.Bg3, RectangleShape)
                    .border(1.dp, if (canSave) PulseColors.Accent else PulseColors.Border, RectangleShape)
                    .clickable(enabled = canSave) { save() }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Save", color = if (canSave) PulseColors.Bg else PulseColors.FgDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
        }

        Spacer(Modifier.height(16.dp))
        FieldLabel("Name")
        OutlineField(value = name, onValueChange = { name = it }, placeholder = "e.g. Code review")
        Spacer(Modifier.height(12.dp))
        FieldLabel("Description")
        OutlineField(value = description, onValueChange = { description = it }, placeholder = "One sentence. Shows in popover.")
        Spacer(Modifier.height(12.dp))
        FieldLabel("Body (the prompt prepended to the chat)")
        OutlineField(value = body, onValueChange = { body = it }, placeholder = "You are a senior engineer…", minHeight = 120, singleLine = false)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            FieldLabel("Triggers")
            Spacer(Modifier.width(4.dp))
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(PulseColors.Bg3, RectangleShape)
                    .border(1.dp, PulseColors.Border, RectangleShape)
                    .clickable { onShowHelp() },
                contentAlignment = Alignment.Center,
            ) { Text("?", color = PulseColors.Fg, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        }
        OutlineField(value = triggersText, onValueChange = { triggersText = it }, placeholder = "review, code, \"exact phrase\", /regex/, !tag")
        Spacer(Modifier.height(12.dp))
        FieldLabel("Category")
        OutlineField(value = category, onValueChange = { category = it }, placeholder = "Coding, Writing, …")
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(20.dp)
                    .background(if (pinned) PulseColors.Accent else PulseColors.Bg3, RectangleShape)
                    .border(1.dp, PulseColors.Border, RectangleShape)
                    .clickable { pinned = !pinned },
            )
            Spacer(Modifier.width(8.dp))
            Text("Pin to top of popover", color = PulseColors.Fg, fontSize = 13.sp)
        }
        Spacer(Modifier.height(20.dp))
        if (skill.id.isNotBlank() && skill.uses > 0) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Uses: ${skill.uses}", color = PulseColors.FgDim, fontSize = 12.sp)
                Spacer(Modifier.width(16.dp))
                val rate = skill.acceptRate()
                val txt = if (rate == null) "Accept rate: —" else "Accept rate: ${(rate * 100).toInt()}%"
                Text(txt, color = if (rate == null) PulseColors.FgDim else if (rate >= 0.5) PulseColors.Green else PulseColors.Warn, fontSize = 12.sp, modifier = Modifier.clickable { showAcceptRateInfo = !showAcceptRateInfo })
                Spacer(Modifier.width(4.dp))
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .background(PulseColors.Bg3, RectangleShape)
                        .border(1.dp, PulseColors.Border, RectangleShape)
                        .clickable { showAcceptRateInfo = !showAcceptRateInfo },
                    contentAlignment = Alignment.Center,
                ) { Text("?", color = PulseColors.Fg, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier.height(48.dp)
                        .background(PulseColors.Bg3, RectangleShape)
                        .border(1.dp, PulseColors.Error, RectangleShape)
                        .clickable { onDelete(skill) }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Delete", color = PulseColors.Error, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
            }
            if (showAcceptRateInfo) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Acceptance rate over the skill's lifetime (since creation). Updated each time you vote a result in or out.",
                    color = PulseColors.Fg, fontSize = 11.sp,
                )
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, color = PulseColors.FgDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 4.dp))
}

@Composable
private fun TriggersHelpOverlay(onDismiss: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseColors.Bg.copy(alpha = 0.85f))
            .clickable { onDismiss() },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .background(PulseColors.Bg2, RectangleShape)
                .border(1.dp, PulseColors.BorderStrong, RectangleShape)
                .padding(20.dp),
        ) {
            Text("Trigger syntax", color = PulseColors.FgBright, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text("A trigger is a comma-separated list. Each entry is one of:", color = PulseColors.Fg, fontSize = 13.sp)
            Spacer(Modifier.height(8.dp))
            HelpRow("foo", "case-insensitive keyword. Triggers if the message contains foo.")
            HelpRow("\"exact phrase\"", "literal multi-word match. Triggers only on the exact phrase.")
            HelpRow("/regex/", "regular expression (case-insensitive). Triggers if the regex matches anywhere.")
            HelpRow("!tag", "shortcut for tag:tag. Useful with @mentions or [tags] in messages.")
            Spacer(Modifier.height(8.dp))
            Text("Examples: review, code, /class \\w+/, !code, \"fix this bug\"", color = PulseColors.FgDim, fontSize = 12.sp)
            Spacer(Modifier.height(8.dp))
            Text("Empty triggers = manual activation only.", color = PulseColors.FgDim, fontSize = 12.sp)
            Spacer(Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .height(48.dp)
                    .background(PulseColors.Bg3, RectangleShape)
                    .border(1.dp, PulseColors.Border, RectangleShape)
                    .clickable { onDismiss() }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Close", color = PulseColors.Fg, fontSize = 12.sp) }
        }
    }
}

@Composable
private fun HelpRow(syntax: String, desc: String) {
    Row(modifier = Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .width(120.dp)
                .background(PulseColors.Bg, RectangleShape)
                .border(1.dp, PulseColors.Border, RectangleShape)
                .padding(8.dp),
        ) {
            Text(syntax, color = PulseColors.Accent, fontSize = 12.sp)
        }
        Spacer(Modifier.width(8.dp))
        Text(desc, color = PulseColors.Fg, fontSize = 12.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun OutlineField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    minHeight: Int = 44,
    singleLine: Boolean = true,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = minHeight.dp)
            .background(PulseColors.BgInput, RectangleShape)
            .border(1.dp, PulseColors.Border, RectangleShape)
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(color = PulseColors.Fg, fontSize = 13.sp),
            cursorBrush = SolidColor(PulseColors.Accent),
            singleLine = singleLine,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(placeholder, color = PulseColors.FgDim, fontSize = 13.sp)
                }
                inner()
            },
        )
    }
}
