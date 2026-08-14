/*
 * PasswordField — like AuthField, but with a show/hide toggle on the right.
 *
 * The toggle is a text button ("show" / "hide") per the design spec. We reuse
 * AuthField's chrome (label + bordered input) and just swap the input's
 * visualTransformation.
 */
package com.pulse.android.ui.auth.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted

@Composable
fun PasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isValid: Boolean = false,
    errorText: String? = null,
    onImeAction: (() -> Unit)? = null,
) {
    var revealed by remember { mutableStateOf(false) }
    val borderColor = when {
        errorText != null -> PulseRed
        isValid -> PulseAccent
        else -> PulseSurface2
    }
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = PulseTextMuted,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(bottom = 6.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(46.dp)
                .background(PulseSurface2)
                .border(width = 1.dp, color = borderColor)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(
                    color = PulseText,
                    fontSize = 14.sp,
                    fontFamily = FontFamily.Monospace,
                ),
                cursorBrush = SolidColor(PulseAccent),
                visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = androidx.compose.ui.text.input.ImeAction.Done,
                ),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                    onDone = { onImeAction?.invoke() },
                ),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            Text(
                                text = "••••••••",
                                color = PulseTextDim,
                                style = TextStyle(
                                    fontSize = 14.sp,
                                    fontFamily = FontFamily.Monospace,
                                ),
                            )
                        }
                        inner()
                    }
                },
                modifier = Modifier.weight(1f),
            )
            Spacer(modifier = Modifier.size(6.dp))
            Text(
                text = if (revealed) "hide" else "show",
                color = PulseTextMuted,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .clickable { revealed = !revealed }
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            )
        }
        if (errorText != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(errorText, color = PulseRed, style = MaterialTheme.typography.labelSmall)
        }
    }
}
