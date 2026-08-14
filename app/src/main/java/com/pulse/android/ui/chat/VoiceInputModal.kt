/*
 * VoiceInputModal — full-screen voice capture flow.
 *
 * Trigger: tap mic in chat composer or in note editor menu.
 * Layout:
 *   - Top bar: X (cancel) + "Voice input" title
 *   - Center: 80x80 mic button (primary-tinted bg, mic icon 36x36)
 *   - Below mic: animated waveform (5-7 bars, primary)
 *   - Below waveform: "Hold the mic, speak, release" + "Speech is transcribed locally"
 *   - Bottom: live transcript card (60dp min-height)
 *
 * Behavior: press mic → start recording (red dot + timer); release → end recording;
 * Android SpeechRecognizer (on-device) transcribes; final transcript lands in the
 * caller via [onResult]. X cancels with no result.
 */
package com.pulse.android.ui.chat

import android.Manifest
import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.voice.VoiceEvent
import com.pulse.android.data.voice.VoiceTranscriber
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import kotlinx.coroutines.flow.collectLatest

@Composable
fun VoiceInputModal(
    onCancel: () -> Unit,
    onResult: (String) -> Unit,
    transcriber: VoiceTranscriber,
) {
    val ctx = LocalContext.current
    var hasPerm by remember { mutableStateOf(transcriber.hasPermission()) }
    var partial by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var listening by remember { mutableStateOf(false) }
    var transcribing by remember { mutableStateOf(false) }

    val permLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> hasPerm = granted }

    LaunchedEffect(hasPerm, listening) {
        if (hasPerm && listening) {
            transcriber.listen().collectLatest { ev ->
                when (ev) {
                    is VoiceEvent.Ready -> transcribing = false
                    is VoiceEvent.Partial -> partial = ev.text
                    is VoiceEvent.Final -> { partial = ev.text; onResult(ev.text) }
                    is VoiceEvent.Error -> { error = ev.message; listening = false }
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg),
    ) {
        TopBar(
            title = "Voice input",
            onBack = onCancel,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(modifier = Modifier.weight(1f))
            // 80x80 mic button
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(
                        if (listening) PulseRed else PulsePrimary,
                        RoundedCornerShape(0.dp),
                    )
                    .clickable {
                        if (!hasPerm) {
                            permLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        } else {
                            listening = !listening
                            if (!listening) error = null
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Mic,
                    contentDescription = if (listening) "Stop listening" else "Start listening",
                    tint = PulseBg,
                    modifier = Modifier.size(36.dp),
                )
            }
            // Waveform
            Waveform(active = listening)
            Text(
                text = if (listening) "Listening… release mic to stop"
                else "Hold the mic, speak, release",
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = buildAnnotatedString {
                    append("Speech is transcribed ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PulseText)) {
                        append("locally")
                    }
                },
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.weight(1f))
            // Transcript card
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 60.dp)
                    .background(PulseSurface, RoundedCornerShape(0.dp))
                    .padding(12.dp),
            ) {
                if (error != null) {
                    Column {
                        Text(error!!, color = PulseRed, style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Try again",
                            color = PulsePrimary,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.clickable {
                                error = null
                                if (hasPerm) listening = true
                            },
                        )
                    }
                } else if (partial.isBlank() && !listening) {
                    Text("Hold the mic to start", color = PulseTextDim, style = MaterialTheme.typography.bodySmall)
                } else {
                    Text(
                        text = partial.ifBlank { "Listening…" },
                        color = if (partial.isBlank()) PulseTextDim else PulsePrimary,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontFamily = if (listening) FontFamily.Monospace else FontFamily.SansSerif,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun Waveform(active: Boolean) {
    val transition = rememberInfiniteTransition(label = "waveform")
    Row(
        modifier = Modifier.height(28.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        repeat(7) { i ->
            val frac by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = if (active) 1f else 0.3f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 350 + i * 60),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "bar-$i",
            )
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(28.dp * frac)
                    .background(if (active) PulsePrimary else PulseSurface2),
            )
        }
    }
}
