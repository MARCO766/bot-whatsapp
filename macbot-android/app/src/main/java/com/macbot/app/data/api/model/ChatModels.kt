package com.macbot.app.data.api.model

import com.google.gson.annotations.SerializedName

data class ChatResponse(
    val ok: Boolean,
    val numero: String? = null,
    @SerializedName("conexionWhatsappId") val conexionWhatsappId: String? = null,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String? = null,
    val nombre: String? = null,
    val bloqueado: Boolean? = null,
    @SerializedName("cliente_numero") val cliente_numero: String? = null,
    @SerializedName("conversacionId") val conversacionId: String? = null,
    @SerializedName("conversacion_id") val conversacion_id: String? = null,
    @SerializedName("bot_pausado") val bot_pausado: Boolean? = null,
    @SerializedName("bot_pausado_hasta") val bot_pausado_hasta: String? = null,
    @SerializedName("bot_pausado_motivo") val bot_pausado_motivo: String? = null,
    val mensajes: List<ChatMessage>? = null,
    val error: String? = null,
)

data class ChatMessage(
    val id: String? = null,
    @SerializedName("cliente_numero") val cliente_numero: String? = null,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String? = null,
    val direccion: String? = null,
    val tipo: String? = null,
    val contenido: String? = null,
    @SerializedName("imagen_url") val imagen_url: String? = null,
    @SerializedName("media_url") val media_url: String? = null,
    @SerializedName("mime_type") val mime_type: String? = null,
    @SerializedName("creado_en") val creado_en: String? = null,
    @SerializedName("estado_envio") val estado_envio: String? = null,
    @SerializedName("whatsapp_message_id") val whatsapp_message_id: String? = null,
) {
    fun isSaliente(): Boolean = direccion == "saliente"

    fun isSistema(): Boolean = direccion == "sistema"

    fun isEntrante(): Boolean = !isSaliente() && !isSistema()
}

data class MarcarLeidoRequest(
    val numero: String,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String,
)

data class DeleteChatResponse(
    val ok: Boolean,
    val error: String? = null,
)

data class BloquearContactoRequest(
    val numero: String,
)

data class BloqueoContactoResponse(
    val ok: Boolean,
    val bloqueado: Boolean? = null,
    val error: String? = null,
)

data class MarcarLeidoResponse(
    val ok: Boolean,
)

data class SendMessageResponse(
    val ok: Boolean,
    val numero: String? = null,
    val error: String? = null,
)

data class ChatData(
    val numero: String,
    val conexionWhatsappId: String,
    val nombre: String,
    val bloqueado: Boolean,
    val mensajes: List<ChatMessage>,
    val botPausado: Boolean = false,
    val botPausadoHasta: String? = null,
    val botPausadoMotivo: String? = null,
)

data class BotPauseRequest(
    @SerializedName("cliente_numero") val cliente_numero: String,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String,
    val action: String,
)

data class BotPauseResponse(
    val ok: Boolean,
    @SerializedName("bot_pausado") val bot_pausado: Boolean? = null,
    @SerializedName("bot_pausado_hasta") val bot_pausado_hasta: String? = null,
    @SerializedName("bot_pausado_motivo") val bot_pausado_motivo: String? = null,
    val error: String? = null,
)

data class AsignarEtiquetaRequest(
    val numero: String,
    val etiqueta: String,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String,
)

data class QuitarEtiquetaRequest(
    val numero: String,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String,
)

data class EtiquetaChatResponse(
    val ok: Boolean,
    val numero: String? = null,
    val etiqueta: String? = null,
    @SerializedName("conexion_whatsapp_id") val conexion_whatsapp_id: String? = null,
    val error: String? = null,
)
