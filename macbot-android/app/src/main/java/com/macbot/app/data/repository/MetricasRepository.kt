package com.macbot.app.data.repository

import com.macbot.app.data.api.MetricasApi
import com.macbot.app.data.api.model.FlujoListaItem
import com.macbot.app.data.api.model.MetricasDiagnosticoResponse
import com.macbot.app.ui.inbox.InboxConstants
import com.macbot.app.data.api.model.MetricasFlujosResponse
import com.macbot.app.data.api.model.MetricasFunnelResponse
import com.macbot.app.data.api.model.MetricasHeatmapResponse
import com.macbot.app.data.api.model.MetricasQueryParams
import com.macbot.app.data.api.model.MetricasResumenResponse
import com.macbot.app.data.api.model.MetricasRevenueBreakdownResponse
import com.macbot.app.data.api.model.MetricasSeriesResponse

class MetricasRepository(
    private val metricasApi: MetricasApi,
) {
    suspend fun fetchResumen(params: MetricasQueryParams): InboxResult<MetricasResumenResponse> {
        return executeRequired(
            call = { metricasApi.getResumen(params.toQueryMap()) },
            validate = { body -> body?.kpis != null || body?.ok == true },
            fallbackError = "Error cargando métricas",
        )
    }

    suspend fun fetchFunnel(params: MetricasQueryParams): InboxResult<MetricasFunnelResponse> {
        return executeOptional(
            call = { metricasApi.getFunnel(params.toQueryMap()) },
            fallbackError = "No se pudo cargar el embudo",
        )
    }

    suspend fun fetchSeries(params: MetricasQueryParams): InboxResult<MetricasSeriesResponse> {
        return executeOptional(
            call = { metricasApi.getSeries(params.toQueryMap()) },
            fallbackError = "No se pudieron cargar las series",
        )
    }

    suspend fun fetchFlujos(params: MetricasQueryParams): InboxResult<MetricasFlujosResponse> {
        return executeOptional(
            call = { metricasApi.getFlujos(params.toQueryMap()) },
            fallbackError = "No se pudieron cargar métricas por flujo",
        )
    }

    suspend fun fetchDiagnostico(params: MetricasQueryParams): InboxResult<MetricasDiagnosticoResponse> {
        return executeOptional(
            call = { metricasApi.getDiagnostico(params.toQueryMap()) },
            fallbackError = "No se pudo cargar el diagnóstico",
        )
    }

    suspend fun fetchHeatmap(params: MetricasQueryParams): InboxResult<MetricasHeatmapResponse> {
        return executeOptional(
            call = { metricasApi.getHeatmap(params.toQueryMap()) },
            fallbackError = "No se pudo cargar el heatmap",
        )
    }

    suspend fun fetchRevenueBreakdown(
        params: MetricasQueryParams,
    ): InboxResult<MetricasRevenueBreakdownResponse> {
        return executeOptional(
            call = { metricasApi.getRevenueBreakdown(params.toQueryMap()) },
            fallbackError = "No se pudo cargar el desglose de ingresos",
        )
    }

    suspend fun fetchFlujosLista(selectedConexionId: String): InboxResult<List<FlujoListaItem>> {
        val conexionParam = if (selectedConexionId == InboxConstants.CONEXION_TODAS) {
            InboxConstants.CONEXION_TODAS
        } else {
            selectedConexionId
        }
        return executeOptional(
            call = { metricasApi.getFlujosBuilder(conexionWhatsappId = conexionParam) },
            fallbackError = "No se pudo cargar la lista de flujos",
        ).mapSuccess { response ->
            response.flows.orEmpty()
                .map { flow ->
                    FlujoListaItem(
                        id = flow.id,
                        nombre = flow.nombre,
                        conexionWhatsappId = flow.conexionWhatsappId,
                    )
                }
                .sortedBy { it.nombre.orEmpty().lowercase() }
        }
    }

    private inline fun <T, R> InboxResult<T>.mapSuccess(transform: (T) -> R): InboxResult<R> {
        return when (this) {
            is InboxResult.Success -> InboxResult.Success(transform(data))
            InboxResult.Unauthorized -> InboxResult.Unauthorized
            is InboxResult.Error -> InboxResult.Error(message)
        }
    }

    private suspend inline fun <reified T> executeRequired(
        crossinline call: suspend () -> retrofit2.Response<T>,
        crossinline validate: (T?) -> Boolean,
        fallbackError: String,
    ): InboxResult<T> where T : Any {
        return try {
            val response = call()
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (validate(body)) {
                        InboxResult.Success(body!!)
                    } else {
                        val errorBody = body as? MetricasResumenResponse
                        InboxResult.Error(errorBody?.error ?: fallbackError)
                    }
                }
                else -> {
                    val errorMsg = extractError(response.errorBody()?.string()) ?: fallbackError
                    InboxResult.Error("$errorMsg (${response.code()})")
                }
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    private suspend inline fun <reified T> executeOptional(
        crossinline call: suspend () -> retrofit2.Response<T>,
        fallbackError: String,
    ): InboxResult<T> where T : Any {
        return try {
            val response = call()
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body != null) {
                        InboxResult.Success(body)
                    } else {
                        InboxResult.Error(fallbackError)
                    }
                }
                else -> {
                    val errorMsg = extractError(response.errorBody()?.string()) ?: fallbackError
                    InboxResult.Error("$errorMsg (${response.code()})")
                }
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    private fun extractError(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val match = Regex(""""error"\s*:\s*"([^"]+)"""").find(raw)
        return match?.groupValues?.getOrNull(1)
    }
}

internal fun MetricasQueryParams.toQueryMap(): Map<String, String> {
    val query = linkedMapOf("periodo" to periodo)
    conexionWhatsappId?.trim()?.takeIf { it.isNotEmpty() }?.let { query["conexion_whatsapp_id"] = it }
    flujoId?.trim()?.takeIf { it.isNotEmpty() }?.let { query["flujo_id"] = it }
    desde?.trim()?.takeIf { it.isNotEmpty() }?.let { query["desde"] = it }
    hasta?.trim()?.takeIf { it.isNotEmpty() }?.let { query["hasta"] = it }
    return query
}
