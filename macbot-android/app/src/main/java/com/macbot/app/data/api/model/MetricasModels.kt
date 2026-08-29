package com.macbot.app.data.api.model

import com.google.gson.annotations.SerializedName

data class MetricasResumenResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val kpis: MetricasKpis? = null,
    val salud: MetricasSalud? = null,
    val metaAds: MetricasMetaAds? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasKpis(
    val leads: Int? = null,
    val conversaciones: Int? = null,
    val mensajesEnviados: Int? = null,
    val mensajesEntrantes: Int? = null,
    val respuestas: Int? = null,
    val ventas: Int? = null,
    val ingresos: Double? = null,
    val moneda: String? = null,
    val ingresosDesglose: Map<String, Double>? = null,
    val seguimientosActivos: Int? = null,
    val seguimientosEnviados: Int? = null,
    val seguimientosCancelados: Int? = null,
    val seguimientosRespondidos: Int? = null,
    val tasaCierre: Double? = null,
    val conversion: Double? = null,
    val tendenciaLeads: Double? = null,
    val tendenciaConversaciones: Double? = null,
    val tendenciaVentas: Double? = null,
)

data class MetricasSalud(
    val score: Int? = null,
    val label: String? = null,
)

data class MetricasMetaAds(
    val conectado: Boolean? = null,
    val mensaje: String? = null,
)

data class MetricasFunnelResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val etapas: List<MetricasFunnelEtapa>? = null,
    val vacio: Boolean? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasFunnelEtapa(
    val nombre: String? = null,
    val cantidad: Int? = null,
    val color: String? = null,
    val porcentaje: Int? = null,
    val tasaVsLeads: Double? = null,
)

data class MetricasSeriesResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val diario: List<MetricasSerieDia>? = null,
    val conversionesPorFlujo: Map<String, Int>? = null,
    val vacio: Boolean? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasSerieDia(
    val fecha: String? = null,
    val leads: Int? = null,
    val mensajes: Int? = null,
    val ventas: Int? = null,
    val ingresos: Double? = null,
)

data class MetricasFlujosResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujos: List<MetricasFlujoItem>? = null,
    val destacados: MetricasFlujosDestacados? = null,
    val sinActividad: List<MetricasFlujoItem>? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasFlujoItem(
    val flujoId: String? = null,
    val nombre: String? = null,
    val leads: Int? = null,
    val respuestas: Int? = null,
    val conversiones: Int? = null,
    val seguimientosPendientes: Int? = null,
    val actividad: Int? = null,
)

data class MetricasFlujosDestacados(
    val masLeads: MetricasFlujoItem? = null,
    val masRespuestas: MetricasFlujoItem? = null,
    val masConversiones: MetricasFlujoItem? = null,
    val masPendientes: MetricasFlujoItem? = null,
)

data class MetricasDiagnosticoResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val items: List<MetricasDiagnosticoItem>? = null,
    val salud: MetricasSalud? = null,
    val recomendacion: String? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasDiagnosticoItem(
    val tipo: String? = null,
    val texto: String? = null,
)

data class MetricasHeatmapResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val heatmap: MetricasHeatmapData? = null,
    val vacio: Boolean? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasHeatmapData(
    val horas: List<MetricasHeatmapHora>? = null,
    val max: Int? = null,
)

data class MetricasHeatmapHora(
    val hora: Int? = null,
    val mensajes: Int? = null,
    val leads: Int? = null,
    val total: Int? = null,
)

data class MetricasRevenueBreakdownResponse(
    val ok: Boolean? = null,
    val periodo: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val flujoId: String? = null,
    val porMoneda: Map<String, MetricasRevenueMoneda>? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MetricasRevenueMoneda(
    val kpis: MetricasRevenueKpis? = null,
    val total: MetricasRevenueTotal? = null,
)

data class MetricasRevenueKpis(
    val totalCantidad: Int? = null,
    val totalIngresos: Double? = null,
)

data class MetricasRevenueTotal(
    val cantidad: Int? = null,
    val ingresos: Double? = null,
)

data class MetricasFlujosListaResponse(
    val ok: Boolean? = null,
    val flujos: List<FlujoListaItem>? = null,
    val error: String? = null,
)

data class FlujoListaItem(
    val id: String? = null,
    val nombre: String? = null,
    @SerializedName("conexion_whatsapp_id") val conexionWhatsappId: String? = null,
)

data class FlujosBuilderListResponse(
    val ok: Boolean? = null,
    val flows: List<FlujoBuilderItem>? = null,
    val error: String? = null,
)

data class FlujoBuilderItem(
    val id: String? = null,
    val nombre: String? = null,
    @SerializedName("conexion_whatsapp_id") val conexionWhatsappId: String? = null,
)

data class MetricasQueryParams(
    val periodo: String,
    val conexionWhatsappId: String? = null,
    val flujoId: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
)
