package com.macbot.app.data.api.model

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.annotations.JsonAdapter
import java.lang.reflect.Type

data class ConexionesResponse(
    val ok: Boolean,
    val conexiones: List<ConexionWhatsapp>? = null,
    val error: String? = null,
)

@JsonAdapter(ConexionWhatsappDeserializer::class)
data class ConexionWhatsapp(
    val id: String,
    val nombre: String? = null,
    val numero: String? = null,
    val phone_id: String? = null,
    val activo: Boolean? = null,
    val creado_en: String? = null,
    val estado: String? = null,
)

class ConexionWhatsappDeserializer : JsonDeserializer<ConexionWhatsapp> {
    override fun deserialize(
        json: JsonElement,
        typeOfT: Type,
        context: JsonDeserializationContext,
    ): ConexionWhatsapp {
        val obj = json.asJsonObject
        val idElement = obj.get("id")
        val id = when {
            idElement == null || idElement.isJsonNull -> ""
            idElement.isJsonPrimitive && idElement.asJsonPrimitive.isNumber ->
                idElement.asJsonPrimitive.asNumber.toString()
            else -> idElement.asString
        }
        return ConexionWhatsapp(
            id = id,
            nombre = obj.get("nombre")?.takeIf { !it.isJsonNull }?.asString,
            numero = obj.get("numero")?.takeIf { !it.isJsonNull }?.asString,
            phone_id = obj.get("phone_id")?.takeIf { !it.isJsonNull }?.asString,
            activo = obj.get("activo")?.takeIf { !it.isJsonNull }?.asBoolean,
            creado_en = obj.get("creado_en")?.takeIf { !it.isJsonNull }?.asString,
            estado = obj.get("estado")?.takeIf { !it.isJsonNull }?.asString,
        )
    }
}

data class InboxResponse(
    val ok: Boolean,
    val usuarioId: String? = null,
    val conexionWhatsappId: String? = null,
    val etiquetaFiltro: String? = null,
    val etiquetasUnicas: List<String>? = null,
    val etiquetasDisponibles: List<EtiquetaDisponible>? = null,
    val mapaColoresEtiquetas: Map<String, String>? = null,
    val chats: List<InboxChat>? = null,
    val totalNoLeidos: Int? = null,
    val hasMore: Boolean? = null,
    val offset: Int? = null,
    val limit: Int? = null,
    val totalConversations: Int? = null,
    val error: String? = null,
)

data class EtiquetaDisponible(
    val nombre: String? = null,
    val color: String? = null,
    val conexion_whatsapp_id: String? = null,
)

data class InboxChatEtiqueta(
    val nombre: String? = null,
    val color: String? = null,
)

data class InboxChat(
    val chatKey: String? = null,
    val numero: String? = null,
    val cliente_numero: String? = null,
    val conexion_whatsapp_id: String? = null,
    val conexionWhatsappId: String? = null,
    val conexion_nombre: String? = null,
    val conversacion_id: String? = null,
    val conversacionId: String? = null,
    val nombre: String? = null,
    val bloqueado: Boolean? = null,
    val online: Boolean? = null,
    val noLeidos: Int? = null,
    val ultimoMensaje: String? = null,
    val ultimoMensajeEn: String? = null,
    val etiquetas: List<InboxChatEtiqueta>? = null,
    val bot_pausado: Boolean? = null,
    val bot_pausado_hasta: String? = null,
    val bot_pausado_motivo: String? = null,
) {
    fun effectiveNumero(): String = numero ?: cliente_numero ?: ""

    fun effectiveConexionId(): String = conexion_whatsapp_id ?: conexionWhatsappId ?: ""

    fun displayName(): String {
        val n = nombre?.trim()
        return if (!n.isNullOrEmpty()) n else effectiveNumero()
    }
}
