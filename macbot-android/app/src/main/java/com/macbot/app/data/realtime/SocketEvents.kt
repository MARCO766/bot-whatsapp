package com.macbot.app.data.realtime

/** Eventos Socket.IO canónicos (snake_case) — mismos nombres que el CRM web. */
object SocketEvents {
    const val NUEVO_MENSAJE = "nuevo_mensaje"
    const val MENSAJE_ESTADO = "mensaje_estado"
    const val SEGUIMIENTO_ACTUALIZADO = "seguimiento_actualizado"

    val INBOX_CHAT_EVENTS = listOf(
        NUEVO_MENSAJE,
        MENSAJE_ESTADO,
        SEGUIMIENTO_ACTUALIZADO,
    )
}
