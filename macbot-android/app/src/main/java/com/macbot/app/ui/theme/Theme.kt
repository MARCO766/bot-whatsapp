package com.macbot.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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
    background = Color(0xFF101816),
    onBackground = Color(0xFFE4EDEA),
    surface = Color(0xFF1A2421),
    onSurface = Color(0xFFE4EDEA),
    surfaceVariant = Color(0xFF24302C),
    onSurfaceVariant = Color(0xFFB0C4BC),
    error = MacError,
    onError = Color.White,
)

@Composable
fun MacBotTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = MacBotTypography,
        content = content,
    )
}
