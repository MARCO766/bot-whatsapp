package com.macbot.app.util

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val zone = ZoneId.systemDefault()
private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())
private val dayMonthFormatter = DateTimeFormatter.ofPattern("d MMM", Locale("es"))

/**
 * Formato similar al de la bandeja web (hora hoy, fecha en días anteriores).
 */
fun formatFechaListaChat(fechaIso: String?): String {
    if (fechaIso.isNullOrBlank()) return ""
    return try {
        val instant = Instant.parse(fechaIso)
        val dateTime = instant.atZone(zone)
        val today = LocalDate.now(zone)
        val messageDate = dateTime.toLocalDate()
        when {
            messageDate == today -> dateTime.format(timeFormatter)
            messageDate.year == today.year -> dateTime.format(dayMonthFormatter)
            else -> dateTime.format(DateTimeFormatter.ofPattern("d/M/yy", Locale.getDefault()))
        }
    } catch (_: Exception) {
        ""
    }
}

fun contactInitial(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    return trimmed.first().uppercaseChar().toString()
}
