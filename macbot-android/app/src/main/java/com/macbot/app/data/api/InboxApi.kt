package com.macbot.app.data.api

import com.macbot.app.data.api.model.AsignarEtiquetaRequest
import com.macbot.app.data.api.model.BloquearContactoRequest
import com.macbot.app.data.api.model.BloqueoContactoResponse
import com.macbot.app.data.api.model.BotPauseRequest
import com.macbot.app.data.api.model.BotPauseResponse
import com.macbot.app.data.api.model.ChatResponse
import com.macbot.app.data.api.model.ConexionesResponse
import com.macbot.app.data.api.model.DeleteChatResponse
import com.macbot.app.data.api.model.EtiquetaChatResponse
import com.macbot.app.data.api.model.InboxResponse
import com.macbot.app.data.api.model.MarcarLeidoRequest
import com.macbot.app.data.api.model.MarcarLeidoResponse
import com.macbot.app.data.api.model.QuitarEtiquetaRequest
import com.macbot.app.data.api.model.SendMessageResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Query

interface InboxApi {
    @GET("/api/inbox/conexiones")
    suspend fun getConexiones(): Response<ConexionesResponse>

    @GET("/api/inbox")
    suspend fun getInbox(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("conexion_whatsapp_id") conexionWhatsappId: String? = null,
        @Query("etiqueta") etiqueta: String? = null,
    ): Response<InboxResponse>

    @GET("/api/inbox/chat")
    suspend fun getChat(
        @Query("numero") numero: String,
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
    ): Response<ChatResponse>

    @DELETE("/api/inbox/chat")
    suspend fun eliminarChat(
        @Query("numero") numero: String,
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
    ): Response<DeleteChatResponse>

    @POST("/api/inbox/marcar-leido")
    suspend fun marcarLeido(@Body body: MarcarLeidoRequest): Response<MarcarLeidoResponse>

    @POST("/api/inbox/etiqueta")
    suspend fun asignarEtiqueta(
        @Body body: AsignarEtiquetaRequest,
    ): Response<EtiquetaChatResponse>

    @POST("/api/inbox/quitar-etiqueta")
    suspend fun quitarEtiqueta(
        @Body body: QuitarEtiquetaRequest,
    ): Response<EtiquetaChatResponse>

    @POST("/api/inbox/bot-pause")
    suspend fun setBotPause(@Body body: BotPauseRequest): Response<BotPauseResponse>

    @POST("/api/inbox/bloquear")
    suspend fun bloquearContacto(
        @Body body: BloquearContactoRequest,
    ): Response<BloqueoContactoResponse>

    @POST("/api/inbox/desbloquear")
    suspend fun desbloquearContacto(
        @Body body: BloquearContactoRequest,
    ): Response<BloqueoContactoResponse>

    @Multipart
    @POST("/api/inbox/responder")
    suspend fun sendMessage(
        @Part("numero") numero: RequestBody,
        @Part("conexion_whatsapp_id") conexionWhatsappId: RequestBody,
        @Part("respuesta") respuesta: RequestBody?,
        @Part archivo: MultipartBody.Part?,
    ): Response<SendMessageResponse>
}
