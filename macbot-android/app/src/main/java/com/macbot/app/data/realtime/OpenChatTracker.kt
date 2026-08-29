package com.macbot.app.data.realtime

/**
 * Chat actualmente abierto en pantalla (para no incrementar no-leídos en bandeja).
 */
class OpenChatTracker {
    @Volatile
    private var openChatKey: String? = null

    fun setOpenChat(numero: String, conexionWhatsappId: String) {
        openChatKey = ChatKey.build(numero, conexionWhatsappId).takeIf { it.isNotEmpty() }
    }

    fun clearOpenChat() {
        openChatKey = null
    }

    fun currentChatKey(): String? = openChatKey

    fun isOpenChat(chatKey: String): Boolean {
        val key = chatKey.trim()
        return key.isNotEmpty() && key == openChatKey
    }
}
