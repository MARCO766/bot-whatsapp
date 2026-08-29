package com.macbot.app.data.realtime

import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.data.api.model.InboxChat

object ChatKey {
    fun build(numero: String, conexionWhatsappId: String): String {
        val n = numero.trim()
        val c = conexionWhatsappId.trim()
        if (n.isEmpty() || c.isEmpty()) return ""
        return "$n::$c"
    }

    fun fromMessage(message: ChatMessage): String {
        val numero = message.cliente_numero?.trim().orEmpty()
        val conexionId = message.conexion_whatsapp_id?.trim().orEmpty()
        return build(numero, conexionId)
    }

    fun fromInboxChat(chat: InboxChat): String {
        val existing = chat.chatKey?.trim().orEmpty()
        if (existing.isNotEmpty()) return existing
        return build(chat.effectiveNumero(), chat.effectiveConexionId())
    }

    fun matchesChat(
        numero: String,
        conexionWhatsappId: String,
        message: ChatMessage,
    ): Boolean {
        val expected = build(numero, conexionWhatsappId)
        if (expected.isEmpty()) return false
        val messageKey = fromMessage(message)
        if (messageKey.isNotEmpty() && messageKey == expected) return true
        val msgNumero = message.cliente_numero?.trim().orEmpty()
        val msgConexion = message.conexion_whatsapp_id?.trim().orEmpty()
        return msgNumero == numero.trim() && msgConexion == conexionWhatsappId.trim()
    }
}
