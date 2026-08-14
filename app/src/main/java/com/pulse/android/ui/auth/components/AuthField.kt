/*
 * AuthField — label + input + right-side valid/invalid indicator.
 *
 * Layout per design spec:
 *   - Label above input, 13px
 *   - Input: bg-2, 1px border, square edges, mono font 14px
 *   - Right slot: green check on valid, blank on neutral, no icon on invalid (red
 *     border + small hint under the field carries the error)
 */
package com.pulse.android.ui.auth.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseGreen
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons

@Composable
fun AuthField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    isValid: Boolean = false,
    errorText: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: androidx.compose.ui.text.input.ImeAction = androidx.compose.ui.text.input.ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    singleLine: Boolean = true,
) {
    val borderColor = when {
        errorText != null -> PulseRed
        isValid -> PulseGreen
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
                singleLine = singleLine,
                textStyle = TextStyle(
                    color = PulseText,
                    fontSize = 14.sp,
                    fontFamily = FontFamily.Monospace,
                ),
                cursorBrush = SolidColor(PulseAccent),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = keyboardType.asCompose(),
                    imeAction = imeAction,
                ),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                    onAny = { onImeAction?.invoke() },
                ),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
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
            if (isValid) {
                Spacer(modifier = Modifier.size(6.dp))
                Box(
                    modifier = Modifier
                        .size(width = 14.dp, height = 14.dp)
                        .background(PulseGreen, RoundedCornerShape(0.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.CheckSquare,
                        contentDescription = null,
                        tint = PulseSurface2,
                        modifier = Modifier.size(10.dp),
                    )
                }
            }
        }
        if (errorText != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = errorText,
                color = PulseRed,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

enum class KeyboardType {
    Text, Email, Password, Number;

    fun asCompose(): androidx.compose.ui.text.input.KeyboardType = when (this) {
        Text -> androidx.compose.ui.text.input.KeyboardType.Text
        Email -> androidx.compose.ui.text.input.KeyboardType.Email
        Password -> androidx.compose.ui.text.input.KeyboardType.Password
        Number -> androidx.compose.ui.text.input.KeyboardType.Number
    }
}
