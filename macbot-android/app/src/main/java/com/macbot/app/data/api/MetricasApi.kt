package com.macbot.app.data.api

import com.macbot.app.data.api.model.FlujosBuilderListResponse
import com.macbot.app.data.api.model.MetricasDiagnosticoResponse
import com.macbot.app.data.api.model.MetricasFlujosListaResponse
import com.macbot.app.data.api.model.MetricasFlujosResponse
import com.macbot.app.data.api.model.MetricasFunnelResponse
import com.macbot.app.data.api.model.MetricasHeatmapResponse
import com.macbot.app.data.api.model.MetricasResumenResponse
import com.macbot.app.data.api.model.MetricasRevenueBreakdownResponse
import com.macbot.app.data.api.model.MetricasSeriesResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.QueryMap

interface MetricasApi {
    @GET("/api/metricas/resumen")
    suspend fun getResumen(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasResumenResponse>

    @GET("/api/metricas/funnel")
    suspend fun getFunnel(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasFunnelResponse>

    @GET("/api/metricas/series")
    suspend fun getSeries(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasSeriesResponse>

    @GET("/api/metricas/flujos")
    suspend fun getFlujos(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasFlujosResponse>

    @GET("/api/metricas/diagnostico")
    suspend fun getDiagnostico(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasDiagnosticoResponse>

    @GET("/api/metricas/heatmap")
    suspend fun getHeatmap(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasHeatmapResponse>

    @GET("/api/metricas/revenue-breakdown")
    suspend fun getRevenueBreakdown(
        @QueryMap query: Map<String, String>,
    ): Response<MetricasRevenueBreakdownResponse>

    @GET("/api/metricas/flujos-lista")
    suspend fun getFlujosLista(): Response<MetricasFlujosListaResponse>

    @GET("/api/flujos")
    suspend fun getFlujosBuilder(
        @Query("conexion_whatsapp_id") conexionWhatsappId: String,
    ): Response<FlujosBuilderListResponse>
}
