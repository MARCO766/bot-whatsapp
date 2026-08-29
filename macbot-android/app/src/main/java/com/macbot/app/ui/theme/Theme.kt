package com.macbot.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = MacGreen,
    onPrimary = Color.White,
    primaryContainer = MacGreenLight,
    onPrimaryContainer = MacGreenDark,
    secondary = MacGreenDark,
    onSecondary = Color.White,
    background = MacSurface,
    onBackground = MacOnSurface,
    surface = Color.White,
    onSurface = MacOnSurface,
    surfaceVariant = MacGreenLight,
    onSurfaceVariant = MacOnSurfaceMuted,
    outline = MacOnSurfaceMuted.copy(alpha = 0.4f),
    outlineVariant = MacOnSurfaceMuted.copy(alpha = 0.2f),
    error = MacError,
    onError = Color.White,
)

private val DarkColorScheme = darkColorScheme(
    primary = MacGreen,
    onPrimary = Color.White,
    primaryContainer = MacGreenDark,
    onPrimaryContainer = MacGreenLight,
    secondary = MacGreenLight,
    onSecondary = MacGreenDark,
    background = MacDarkBackground,
    onBackground = MacDarkOnSurface,
    surface = MacDarkSurface,
    onSurface = MacDarkOnSurface,
    surfaceVariant = MacDarkSurfaceVariant,
    onSurfaceVariant = MacDarkOnSurfaceVariant,
    outline = MacDarkOnSurfaceVariant.copy(alpha = 0.5f),
    outlineVariant = MacDarkSurfaceVariant,
    error = MacError,
    onError = Color.White,
)

@Composable
fun MacBotTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = MacBotTypography,
        content = content,
    )
}
