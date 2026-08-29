package com.macbot.app.data.realtime

import com.macbot.app.data.api.model.ChatMessage

data class SeguimientoSocketPayload(
    val cliente_numero: String? = null,
    val conexion_whatsapp_id: String? = null,
    val chatKey: String? = null,
    val paso_index: Int? = null,
    val estado: String? = null,
    val paso_id: String? = null,
    val run_at: String? = null,
)

sealed class SocketEvent {
    abstract val eventName: String

    data class NuevoMensaje(
        val message: ChatMessage,
        val chatKey: String,
    ) : SocketEvent() {
        override val eventName: String = SocketEvents.NUEVO_MENSAJE
    }

    data class MensajeEstado(
        val whatsappMessageId: String,
        val estadoEnvio: String,
    ) : SocketEvent() {
        override val eventName: String = SocketEvents.MENSAJE_ESTADO
    }

    data class SeguimientoActualizado(
        val payload: SeguimientoSocketPayload,
        val chatKey: String,
    ) : SocketEvent() {
        override val eventName: String = SocketEvents.SEGUIMIENTO_ACTUALIZADO
    }
}
