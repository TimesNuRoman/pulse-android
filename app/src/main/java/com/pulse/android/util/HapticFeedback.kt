/*
 * HapticFeedback — small wrapper around Android's Vibrator so screens can request
 * short ticks on selection / error / save-success without worrying about API levels.
 */
package com.pulse.android.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object HapticFeedback {
    fun tick(context: Context, durationMs: Long = 12) {
        val v = vibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(durationMs)
        }
    }

    fun double(context: Context) {
        val v = vibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 20, 60, 20), -1))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(longArrayOf(0, 20, 60, 20), -1)
        }
    }

    private fun vibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
}
