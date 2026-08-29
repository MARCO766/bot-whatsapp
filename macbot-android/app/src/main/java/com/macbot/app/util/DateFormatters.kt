package com.macbot.app.util

import com.macbot.app.data.api.model.ChatMessage
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

fun formatFechaHoraMensaje(fechaIso: String?): String {
    if (fechaIso.isNullOrBlank()) return ""
    val instant = parseFechaUtc(fechaIso) ?: return ""
    val dateTime = instant.atZone(zone)
    val today = LocalDate.now(zone)
    val messageDate = dateTime.toLocalDate()
    val hora = dateTime.format(timeFormatter)
    return when {
        messageDate == today -> hora
        messageDate == today.minusDays(1) -> "Ayer · $hora"
        else -> {
            val fecha = dateTime.format(
                DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.getDefault()),
            )
            "$fecha · $hora"
        }
    }
}

fun messageChecksText(estadoEnvio: String?): String {
    return when (estadoEnvio) {
        "read", "delivered" -> "✓✓"
        "sent" -> "✓"
        else -> ""
    }
}

fun messageDisplayText(message: ChatMessage): String {
    val contenido = message.contenido?.trim().orEmpty()
    val hasMedia = !message.imagen_url.isNullOrBlank() || !message.media_url.isNullOrBlank()
    val tipo = message.tipo?.trim().orEmpty()

    if (contenido.isNotEmpty() && !contenido.startsWith("http")) {
        return contenido
    }

    if (hasMedia || tipo.isNotEmpty()) {
        return when {
            tipo.contains("image", ignoreCase = true) ||
                contenido.equals("image", ignoreCase = true) ||
                contenido.equals("imagen", ignoreCase = true) ||
                !message.imagen_url.isNullOrBlank() -> "📷 Imagen"
            tipo.contains("audio", ignoreCase = true) ||
                contenido.equals("audio", ignoreCase = true) -> "🎧 Audio"
            tipo.contains("video", ignoreCase = true) ||
                contenido.equals("video", ignoreCase = true) -> "🎥 Video"
            tipo.contains("document", ignoreCase = true) ||
                contenido.equals("document", ignoreCase = true) -> "📄 Documento"
            contenido.isNotEmpty() -> contenido
            else -> "Archivo adjunto"
        }
    }

    return contenido.ifBlank { "Mensaje" }
}

private fun parseFechaUtc(fecha: String): Instant? {
    return try {
        Instant.parse(fecha)
    } catch (_: Exception) {
        try {
            val normalized = if (fecha.endsWith("Z")) fecha else "${fecha}Z"
            Instant.parse(normalized)
        } catch (_: Exception) {
            null
        }
    }
}
