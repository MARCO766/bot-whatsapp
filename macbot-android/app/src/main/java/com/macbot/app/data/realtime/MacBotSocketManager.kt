package com.macbot.app.data.realtime

import android.util.Log
import com.google.gson.Gson
import com.macbot.app.BuildConfig
import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.data.session.PersistentCookieJar
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONObject
import java.net.URI

class MacBotSocketManager(
    private val cookieJar: PersistentCookieJar,
    private val gson: Gson = Gson(),
) {
    private val _events = MutableSharedFlow<SocketEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<SocketEvent> = _events.asSharedFlow()

    private val lock = Any()
    private var socket: Socket? = null
    private var connectedUsuarioId: String? = null

    fun connect(usuarioId: String) {
        val trimmedId = usuarioId.trim()
        if (trimmedId.isEmpty()) return

        synchronized(lock) {
            if (connectedUsuarioId == trimmedId && socket?.connected() == true) {
                return
            }
            disconnectInternal()
            connectedUsuarioId = trimmedId

            try {
                val options = buildOptions()
                val uri = URI.create(normalizeBaseUrl(BuildConfig.API_BASE_URL))
                val newSocket = IO.socket(uri, options)
                registerListeners(newSocket, trimmedId)
                socket = newSocket
                newSocket.connect()
            } catch (error: Exception) {
                Log.e(TAG, "Error conectando Socket.IO", error)
                disconnectInternal()
            }
        }
    }

    fun reconnectIfNeeded() {
        val usuarioId = synchronized(lock) { connectedUsuarioId } ?: return
        val alreadyConnected = synchronized(lock) { socket?.connected() == true }
        if (alreadyConnected) return
        connect(usuarioId)
    }

    fun disconnect() {
        synchronized(lock) {
            disconnectInternal()
        }
    }

    private fun disconnectInternal() {
        socket?.let { current ->
            SocketEvents.INBOX_CHAT_EVENTS.forEach { event ->
                current.off(event)
            }
            current.off(Socket.EVENT_CONNECT)
            current.off(Socket.EVENT_DISCONNECT)
            current.off(Socket.EVENT_CONNECT_ERROR)
            if (current.connected()) {
                current.disconnect()
            }
        }
        socket = null
        connectedUsuarioId = null
    }

    private fun buildOptions(): IO.Options {
        val cookieHeader = buildCookieHeader()
        return IO.Options().apply {
            path = "/socket.io"
            transports = arrayOf("websocket", "polling")
            reconnection = true
            reconnectionAttempts = Int.MAX_VALUE
            if (cookieHeader != null) {
                extraHeaders = mapOf("Cookie" to listOf(cookieHeader))
            }
        }
    }

    private fun buildCookieHeader(): String? {
        val httpUrl = normalizeBaseUrl(BuildConfig.API_BASE_URL).toHttpUrlOrNull() ?: return null
        return cookieJar.cookieHeaderFor(httpUrl)
    }

    private fun registerListeners(socket: Socket, usuarioId: String) {
        socket.on(Socket.EVENT_CONNECT, Emitter.Listener {
            Log.d(TAG, "Socket conectado, join-user=$usuarioId")
            socket.emit("join-user", usuarioId)
        })

        socket.on(Socket.EVENT_DISCONNECT, Emitter.Listener {
            Log.d(TAG, "Socket desconectado")
        })

        socket.on(Socket.EVENT_CONNECT_ERROR, Emitter.Listener { args ->
            Log.w(TAG, "Socket connect_error: ${args.firstOrNull()}")
        })

        socket.on(SocketEvents.NUEVO_MENSAJE, Emitter.Listener { args ->
            parseNuevoMensaje(args)?.let { emitEvent(it) }
        })

        socket.on(SocketEvents.MENSAJE_ESTADO, Emitter.Listener { args ->
            parseMensajeEstado(args)?.let { emitEvent(it) }
        })

        socket.on(SocketEvents.SEGUIMIENTO_ACTUALIZADO, Emitter.Listener { args ->
            parseSeguimientoActualizado(args)?.let { emitEvent(it) }
        })
    }

    private fun parseNuevoMensaje(args: Array<out Any>): SocketEvent.NuevoMensaje? {
        val json = args.firstOrNull() as? JSONObject ?: return null
        return try {
            val message = gson.fromJson(json.toString(), ChatMessage::class.java)
            val chatKey = ChatKey.fromMessage(message)
            if (chatKey.isEmpty()) return null
            SocketEvent.NuevoMensaje(message = message, chatKey = chatKey)
        } catch (error: Exception) {
            Log.w(TAG, "Error parseando nuevo_mensaje", error)
            null
        }
    }

    private fun parseMensajeEstado(args: Array<out Any>): SocketEvent.MensajeEstado? {
        val json = args.firstOrNull() as? JSONObject ?: return null
        val whatsappMessageId = json.optString("whatsapp_message_id").trim()
        val estadoEnvio = json.optString("estado_envio").trim()
        if (whatsappMessageId.isEmpty() || estadoEnvio.isEmpty()) return null
        return SocketEvent.MensajeEstado(
            whatsappMessageId = whatsappMessageId,
            estadoEnvio = estadoEnvio,
        )
    }

    private fun parseSeguimientoActualizado(args: Array<out Any>): SocketEvent.SeguimientoActualizado? {
        val json = args.firstOrNull() as? JSONObject ?: return null
        return try {
            val payload = gson.fromJson(json.toString(), SeguimientoSocketPayload::class.java)
            val chatKey = payload.chatKey?.trim().takeUnless { it.isNullOrEmpty() }
                ?: ChatKey.build(
                    payload.cliente_numero.orEmpty(),
                    payload.conexion_whatsapp_id.orEmpty(),
                )
            if (chatKey.isEmpty()) return null
            SocketEvent.SeguimientoActualizado(payload = payload, chatKey = chatKey)
        } catch (error: Exception) {
            Log.w(TAG, "Error parseando seguimiento_actualizado", error)
            null
        }
    }

    private fun emitEvent(event: SocketEvent) {
        _events.tryEmit(event)
    }

    private fun normalizeBaseUrl(url: String): String {
        return url.trim().trimEnd('/')
    }

    companion object {
        private const val TAG = "MacBotSocket"
    }
}
