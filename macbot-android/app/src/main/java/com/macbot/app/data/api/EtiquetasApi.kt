package com.macbot.app.data.api

import com.macbot.app.data.api.model.CreateEtiquetaRequest
import com.macbot.app.data.api.model.EtiquetaMutationResponse
import com.macbot.app.data.api.model.EtiquetasResponse
import com.macbot.app.data.api.model.UpdateEtiquetaRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface EtiquetasApi {
    @GET("/api/etiquetas")
    suspend fun listEtiquetas(
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
    ): Response<EtiquetasResponse>

    @POST("/api/etiquetas")
    suspend fun createEtiqueta(
        @Body body: CreateEtiquetaRequest,
    ): Response<EtiquetaMutationResponse>

    @PATCH("/api/etiquetas/{id}")
    suspend fun updateEtiqueta(
        @Path("id") id: String,
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
        @Body body: UpdateEtiquetaRequest,
    ): Response<EtiquetaMutationResponse>

    @DELETE("/api/etiquetas/{id}")
    suspend fun deleteEtiqueta(
        @Path("id") id: String,
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
    ): Response<EtiquetaMutationResponse>
}
