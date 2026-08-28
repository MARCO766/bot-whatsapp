package com.macbot.app.data.repository

import com.macbot.app.data.api.InboxApi
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.InboxChat
import com.macbot.app.data.api.model.InboxResponse

sealed class InboxResult<out T> {
    data class Success<T>(val data: T) : InboxResult<T>()
    data class Error(val message: String) : InboxResult<Nothing>()
    data object Unauthorized : InboxResult<Nothing>()
}

data class InboxPage(
    val chats: List<InboxChat>,
    val hasMore: Boolean,
    val offset: Int,
    val limit: Int,
    val totalNoLeidos: Int,
)

class InboxRepository(
    private val inboxApi: InboxApi,
) {
    suspend fun fetchConexiones(): InboxResult<List<ConexionWhatsapp>> {
        return try {
            val response = inboxApi.getConexiones()
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body?.ok == true) {
                        InboxResult.Success(body.conexiones.orEmpty())
                    } else {
                        InboxResult.Error(body?.error ?: "Error cargando líneas WhatsApp")
                    }
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun fetchInbox(
        limit: Int = PAGE_SIZE,
        offset: Int = 0,
        conexionWhatsappId: String? = null,
        etiqueta: String? = null,
    ): InboxResult<InboxPage> {
        return try {
            val etiquetaParam = etiqueta?.takeIf { it.isNotBlank() }
            val response = inboxApi.getInbox(
                limit = limit,
                offset = offset,
                conexionWhatsappId = conexionWhatsappId,
                etiqueta = etiquetaParam,
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> mapInboxResponse(response.body())
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    private fun mapInboxResponse(body: InboxResponse?): InboxResult<InboxPage> {
        if (body?.ok != true) {
            return InboxResult.Error(body?.error ?: "Error cargando bandeja")
        }
        return InboxResult.Success(
            InboxPage(
                chats = body.chats.orEmpty(),
                hasMore = body.hasMore == true,
                offset = body.offset ?: 0,
                limit = body.limit ?: PAGE_SIZE,
                totalNoLeidos = body.totalNoLeidos ?: 0,
            ),
        )
    }

    companion object {
        const val PAGE_SIZE = 20
    }
}
