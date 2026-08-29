package com.macbot.app.util

import android.util.Log
import com.macbot.app.data.api.model.ChatMessage
import java.time.Instant

private const val MS_24H = 24L * 60L * 60L * 1000L
private const val TAG = "WhatsappVentana24h"

data class Ventana24hState(
    val abierta: Boolean,
    val msTranscurrido: Long,
    val msRestante: Long,
    val ultimoEntrante: ChatMessage? = null,
)

/**
 * Misma lógica que [frontend/src/utils/whatsappVentana24h.js] del CRM web.
 * La ventana de atención de WhatsApp se calcula desde el último mensaje **entrante**
 * del cliente (excluye salientes y mensajes de sistema).
 */
fun calcularVentana24h(
    mensajes: List<ChatMessage>,
    ahoraMs: Long = System.currentTimeMillis(),
): Ventana24hState {
    val ultimoEntrante = getUltimoMensajeEntrante(mensajes)
    if (ultimoEntrante == null) {
        return Ventana24hState(
            abierta = false,
            msTranscurrido = MS_24H + 1,
            msRestante = 0,
            ultimoEntrante = null,
        )
    }

    val instant = parseFechaUtcMensaje(ultimoEntrante.creado_en)
    if (instant == null) {
        Log.w(TAG, "No se pudo parsear creado_en del último mensaje entrante")
        // Si no se puede determinar, mantener envío habilitado (comportamiento seguro).
        return Ventana24hState(
            abierta = true,
            msTranscurrido = 0,
            msRestante = MS_24H,
            ultimoEntrante = ultimoEntrante,
        )
    }

    val ts = instant.toEpochMilli()
    val msTranscurrido = (ahoraMs - ts).coerceAtLeast(0)
    val msRestante = (MS_24H - msTranscurrido).coerceAtLeast(0)

    return Ventana24hState(
        abierta = msTranscurrido <= MS_24H,
        msTranscurrido = msTranscurrido,
        msRestante = msRestante,
        ultimoEntrante = ultimoEntrante,
    )
}

/** Último mensaje del lead (entrante), excluye sistema y salientes. */
fun getUltimoMensajeEntrante(mensajes: List<ChatMessage>): ChatMessage? {
    var ultimo: ChatMessage? = null
    var ultimoTs = Long.MIN_VALUE

    for (message in mensajes) {
        if (!message.isEntrante()) continue
        val instant = parseFechaUtcMensaje(message.creado_en) ?: continue
        val ts = instant.toEpochMilli()
        if (ts > ultimoTs) {
            ultimoTs = ts
            ultimo = message
        }
    }

    return ultimo
}

/**
 * PostgREST devuelve timestamptz sin Z; interpretar como UTC (igual que el CRM web).
 */
internal fun parseFechaUtcMensaje(raw: String?): Instant? {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty()) return null

    return try {
        if (value.endsWith("Z", ignoreCase = true) ||
            Regex("[+-]\\d{2}:?\\d{2}$").containsMatchIn(value)
        ) {
            Instant.parse(value)
        } else {
            var iso = value
            if (iso.contains(" ") && !iso.contains("T")) {
                iso = iso.replace(" ", "T")
            }
            Instant.parse("${iso}Z")
        }
    } catch (_: Exception) {
        null
    }
}
