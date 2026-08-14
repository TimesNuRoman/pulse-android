/*
 * StrengthMeter — 4-bar password strength indicator (signup / reset only).
 *
 * Levels:
 *   1 bar red    — Weak    (length 8-11, all one class)
 *   2 bars orange — Fair
 *   3 bars yellow — Good
 *   4 bars green  — Strong  (length 12+, mixed case, digit, special)
 *
 * The bar backgrounds fill to `level / 4.0` with the appropriate color; the
 * unfilled remainder stays in `PulseSurface2` (greyed out).
 */
package com.pulse.android.ui.auth.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseGreen
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.theme.PulseYellow

enum class PasswordStrength(val level: Int) {
    Empty(0), Weak(1), Fair(2), Good(3), Strong(4);

    companion object {
        /**
         * Heuristic (not zxcvbn). Mirrors the design spec:
         *   - length >= 12 + mixed case + digit + special → Strong
         *   - length >= 10 + 3 of (upper, lower, digit, special) → Good
         *   - length >= 10 + 2 of those → Fair
         *   - length >= 8  + 1 of those → Weak
         *   - else Empty
         */
        fun of(pw: String): PasswordStrength {
            if (pw.isEmpty()) return Empty
            val len = pw.length
            val hasUpper = pw.any { it.isUpperCase() }
            val hasLower = pw.any { it.isLowerCase() }
            val hasDigit = pw.any { it.isDigit() }
            val hasSpecial = pw.any { !it.isLetterOrDigit() }
            val classes = listOf(hasUpper, hasLower, hasDigit, hasSpecial).count { it }
            return when {
                len >= 12 && classes == 4 -> Strong
                len >= 10 && classes >= 3 -> Good
                len >= 10 && classes >= 2 -> Fair
                len >= 8 -> Weak
                else -> Empty
            }
        }
    }
}

@Composable
fun StrengthMeter(
    password: String,
    modifier: Modifier = Modifier,
) {
    val s = PasswordStrength.of(password)
    val activeColor = when (s) {
        PasswordStrength.Empty -> PulseSurface2
        PasswordStrength.Weak -> PulseRed
        PasswordStrength.Fair -> com.pulse.android.theme.PulsePrimary.copy(alpha = 0.6f)
        PasswordStrength.Good -> PulseYellow
        PasswordStrength.Strong -> PulseGreen
    }
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            repeat(4) { i ->
                val active = i < s.level
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(
                            color = if (active) activeColor else PulseSurface2,
                            shape = RoundedCornerShape(0.dp),
                        ),
                )
            }
        }
        if (s != PasswordStrength.Empty) {
            Spacer(modifier = Modifier.size(2.dp))
            Text(
                text = s.name,
                color = PulseTextMuted,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
