package com.macbot.app.data.api

import com.macbot.app.data.api.model.ConexionesResponse
import com.macbot.app.data.api.model.InboxResponse
import retrofit2.Response
import retrofit2.http.GET
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
}
