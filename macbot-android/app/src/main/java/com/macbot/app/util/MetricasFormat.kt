package com.macbot.app.util

import androidx.compose.ui.graphics.Color
import java.util.Locale

fun parseHexColor(hex: String, fallback: Color): Color {
    val raw = hex.trim()
    if (raw.isEmpty()) return fallback
    return try {
        val normalized = if (raw.startsWith("#")) raw else "#$raw"
        Color(android.graphics.Color.parseColor(normalized))
    } catch (_: IllegalArgumentException) {
        fallback
    }
}

fun readableOnColor(background: Color): Color {
    val luminance = 0.299f * background.red + 0.587f * background.green + 0.114f * background.blue
    return if (luminance > 0.55f) Color.Black else Color.White
}

fun formatMetricasNumber(value: Int?): String {
    val v = value ?: 0
    return String.format(Locale.getDefault(), "%,d", v)
}

fun formatMetricasPct(value: Double?): String {
    val v = value ?: 0.0
    if (v == 0.0) return "0%"
    val rounded = (Math.round(v * 100.0) / 100.0)
    return "${String.format(Locale.getDefault(), "%.2f", rounded)}%"
}

fun formatMetricasTendencia(value: Double?): String? {
    if (value == null) return null
    if (!value.isFinite()) return null
    val sign = if (value > 0) "+" else ""
    return "$sign${String.format(Locale.getDefault(), "%.0f", value)}%"
}

fun formatMetricasMoney(amount: Double?, moneda: String?): String {
    val v = amount ?: 0.0
    val rounded = (Math.round(v * 100.0) / 100.0)
    val sym = when (moneda?.trim()?.uppercase(Locale.getDefault())) {
        "USD" -> "US$"
        "CLP" -> "CLP"
        "BOB", "BS" -> "Bs"
        else -> "Bs"
    }
    return if (rounded == 0.0) {
        "$sym 0"
    } else {
        "$sym ${String.format(Locale.getDefault(), "%,.2f", rounded)}"
    }
}
