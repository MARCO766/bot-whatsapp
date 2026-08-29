package com.macbot.app.ui.metricas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.FlujoListaItem
import com.macbot.app.data.api.model.MetricasDiagnosticoResponse
import com.macbot.app.data.api.model.MetricasFlujoItem
import com.macbot.app.data.api.model.MetricasFlujosResponse
import com.macbot.app.data.api.model.MetricasFunnelResponse
import com.macbot.app.data.api.model.MetricasHeatmapResponse
import com.macbot.app.data.api.model.MetricasKpis
import com.macbot.app.data.api.model.MetricasQueryParams
import com.macbot.app.data.api.model.MetricasRevenueBreakdownResponse
import com.macbot.app.data.api.model.MetricasSalud
import com.macbot.app.data.api.model.MetricasSeriesResponse
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.InboxResult
import com.macbot.app.data.repository.MetricasRepository
import com.macbot.app.ui.inbox.InboxConstants
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class MetricasUiState(
    val isLoading: Boolean = true,
    val isUpdating: Boolean = false,
    val isRefreshing: Boolean = false,
    val periodo: String = PERIODO_7D,
    val periodoLabel: String = "7 días",
    val selectedConexionId: String = InboxConstants.CONEXION_TODAS,
    val selectedFlujoId: String? = null,
    val conexiones: List<ConexionWhatsapp> = emptyList(),
    val flujosLista: List<FlujoListaItem> = emptyList(),
    val kpis: MetricasKpis? = null,
    val salud: MetricasSalud? = null,
    val funnel: MetricasFunnelResponse? = null,
    val series: MetricasSeriesResponse? = null,
    val flujos: MetricasFlujosResponse? = null,
    val flujosRanking: List<MetricasFlujoItem> = emptyList(),
    val diagnostico: MetricasDiagnosticoResponse? = null,
    val heatmap: MetricasHeatmapResponse? = null,
    val revenueBreakdown: MetricasRevenueBreakdownResponse? = null,
    val mainError: String? = null,
    val snackbarMessage: String? = null,
    val optionalErrors: Map<String, String> = emptyMap(),
)

object MetricasPeriodos {
    const val HOY = "hoy"
    const val AYER = "ayer"
    const val SIETE_DIAS = "7d"
    const val TREINTA_DIAS = "30d"
    const val NOVENTA_DIAS = "90d"

    val OPTIONS = listOf(
        HOY to "Hoy",
        AYER to "Ayer",
        SIETE_DIAS to "7 días",
        TREINTA_DIAS to "30 días",
        NOVENTA_DIAS to "90 días",
    )
}

private const val PERIODO_7D = MetricasPeriodos.SIETE_DIAS

class MetricasViewModel(
    private val metricasRepository: MetricasRepository,
    private val inboxRepository: InboxRepository,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MetricasUiState())
    val uiState: StateFlow<MetricasUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()
    private var loadGeneration = 0

    init {
        loadInitial()
    }

    fun loadInitial() {
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, mainError = null) }
                loadConexionesInternal()
                loadFlujosListaInternal()
                loadMetricasInternal(buildQueryParams(_uiState.value))
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadMutex.withLock {
                if (_uiState.value.isRefreshing) return@withLock
                _uiState.update { it.copy(isRefreshing = true, mainError = null) }
                loadFlujosListaInternal()
                loadMetricasInternal(buildQueryParams(_uiState.value))
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun retry() = loadInitial()

    fun selectPeriodo(periodo: String) {
        if (periodo == _uiState.value.periodo) return
        val label = MetricasPeriodos.OPTIONS.find { it.first == periodo }?.second ?: periodo
        _uiState.update { it.copy(periodo = periodo, periodoLabel = label) }
        reloadMetricas(reloadFlows = false)
    }

    fun selectConexion(id: String) {
        if (id == _uiState.value.selectedConexionId) return
        _uiState.update {
            it.copy(
                selectedConexionId = id,
                selectedFlujoId = null,
                snackbarMessage = null,
            )
        }
        reloadMetricas(reloadFlows = true)
    }

    fun selectFlujo(flujoId: String?) {
        val normalizedFlujoId = normalizeFlujoId(flujoId)
        if (normalizedFlujoId == _uiState.value.selectedFlujoId) return
        val allowedIds = _uiState.value.flujosLista.mapNotNull { it.id }.toSet()
        if (normalizedFlujoId != null && !flowIdAllowed(normalizedFlujoId, allowedIds)) return
        _uiState.update { it.copy(selectedFlujoId = normalizedFlujoId, snackbarMessage = null) }
        reloadMetricas(reloadFlows = false)
    }

    fun clearFlujoFilter() = selectFlujo(null)

    fun clearSnackbarMessage() {
        _uiState.update { it.copy(snackbarMessage = null) }
    }

    private fun reloadMetricas(reloadFlows: Boolean) {
        viewModelScope.launch {
            loadMutex.withLock {
                val hasData = _uiState.value.kpis != null
                _uiState.update {
                    it.copy(
                        isUpdating = hasData,
                        isLoading = !hasData,
                        mainError = if (hasData) null else it.mainError,
                        snackbarMessage = null,
                    )
                }
                if (reloadFlows) {
                    loadFlujosListaInternal()
                }
                val params = buildQueryParams(_uiState.value)
                loadMetricasInternal(params)
                _uiState.update { it.copy(isUpdating = false, isLoading = false) }
            }
        }
    }

    private suspend fun loadConexionesInternal() {
        when (val result = inboxRepository.fetchConexiones()) {
            is InboxResult.Success -> {
                _uiState.update { it.copy(conexiones = result.data) }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { state ->
                    state.copy(mainError = state.mainError ?: result.message)
                }
            }
        }
    }

    private suspend fun loadFlujosListaInternal() {
        val conexionId = _uiState.value.selectedConexionId
        when (val result = metricasRepository.fetchFlujosLista(conexionId)) {
            is InboxResult.Success -> {
                val flujos = result.data
                val selectedFlujoId = _uiState.value.selectedFlujoId
                val validFlujoId = selectedFlujoId?.takeIf { id ->
                    flujos.any { flow -> flowIdsMatch(flow.id, id) }
                }
                _uiState.update {
                    it.copy(
                        flujosLista = flujos,
                        selectedFlujoId = validFlujoId,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { state ->
                    if (state.flujosLista.isEmpty()) {
                        state.copy(flujosLista = emptyList(), selectedFlujoId = null)
                    } else {
                        state.copy(snackbarMessage = result.message)
                    }
                }
            }
        }
    }

    private suspend fun loadMetricasInternal(params: MetricasQueryParams) {
        val generation = ++loadGeneration

        coroutineScope {
            val resumenDeferred = async { metricasRepository.fetchResumen(params) }
            val funnelDeferred = async { metricasRepository.fetchFunnel(params) }
            val seriesDeferred = async { metricasRepository.fetchSeries(params) }
            val flujosDeferred = async { metricasRepository.fetchFlujos(params) }
            val diagnosticoDeferred = async { metricasRepository.fetchDiagnostico(params) }
            val heatmapDeferred = async { metricasRepository.fetchHeatmap(params) }
            val revenueDeferred = async { metricasRepository.fetchRevenueBreakdown(params) }

            val results = awaitAll(
                resumenDeferred,
                funnelDeferred,
                seriesDeferred,
                flujosDeferred,
                diagnosticoDeferred,
                heatmapDeferred,
                revenueDeferred,
            )

            if (generation != loadGeneration) return@coroutineScope

            @Suppress("UNCHECKED_CAST")
            val resumenResult = results[0] as InboxResult<com.macbot.app.data.api.model.MetricasResumenResponse>
            @Suppress("UNCHECKED_CAST")
            val funnelResult = results[1] as InboxResult<MetricasFunnelResponse>
            @Suppress("UNCHECKED_CAST")
            val seriesResult = results[2] as InboxResult<MetricasSeriesResponse>
            @Suppress("UNCHECKED_CAST")
            val flujosResult = results[3] as InboxResult<MetricasFlujosResponse>
            @Suppress("UNCHECKED_CAST")
            val diagnosticoResult = results[4] as InboxResult<MetricasDiagnosticoResponse>
            @Suppress("UNCHECKED_CAST")
            val heatmapResult = results[5] as InboxResult<MetricasHeatmapResponse>
            @Suppress("UNCHECKED_CAST")
            val revenueResult = results[6] as InboxResult<MetricasRevenueBreakdownResponse>

            if (generation != loadGeneration) return@coroutineScope

            val optionalErrors = mutableMapOf<String, String>()
            var snackbarMessage: String? = null

            _uiState.update { state ->
                var next = state

                when (resumenResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Error -> {
                        if (state.kpis == null) {
                            next = next.copy(
                                kpis = null,
                                salud = null,
                                mainError = resumenResult.message,
                            )
                        } else {
                            snackbarMessage = resumenResult.message
                        }
                    }
                    is InboxResult.Success -> {
                        val body = resumenResult.data
                        if (responseMatchesParams(body.flujoId, params.flujoId)) {
                            next = next.copy(
                                kpis = body.kpis,
                                salud = body.salud,
                                mainError = null,
                            )
                        }
                    }
                }

                when (funnelResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        if (responseMatchesParams(funnelResult.data.flujoId, params.flujoId)) {
                            next = next.copy(funnel = funnelResult.data)
                        }
                    }
                    is InboxResult.Error -> optionalErrors["embudo"] = funnelResult.message
                }

                when (seriesResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        if (responseMatchesParams(seriesResult.data.flujoId, params.flujoId)) {
                            next = next.copy(series = seriesResult.data)
                        }
                    }
                    is InboxResult.Error -> optionalErrors["series"] = seriesResult.message
                }

                when (flujosResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        val allowedIds = next.flujosLista.mapNotNull { it.id }.toSet()
                        val filtered = flujosResult.data.flujos.orEmpty().filter { flujo ->
                            flujo.flujoId != null && flowIdAllowed(flujo.flujoId, allowedIds)
                        }
                        val ranking = sortFlujosRanking(filtered)
                        next = next.copy(
                            flujos = flujosResult.data,
                            flujosRanking = ranking,
                        )
                    }
                    is InboxResult.Error -> optionalErrors["flujos"] = flujosResult.message
                }

                when (diagnosticoResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        if (responseMatchesParams(diagnosticoResult.data.flujoId, params.flujoId)) {
                            next = next.copy(diagnostico = diagnosticoResult.data)
                        }
                    }
                    is InboxResult.Error -> optionalErrors["diagnostico"] = diagnosticoResult.message
                }

                when (heatmapResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        if (responseMatchesParams(heatmapResult.data.flujoId, params.flujoId)) {
                            next = next.copy(heatmap = heatmapResult.data)
                        }
                    }
                    is InboxResult.Error -> optionalErrors["heatmap"] = heatmapResult.message
                }

                when (revenueResult) {
                    InboxResult.Unauthorized -> {
                        onUnauthorized()
                        return@update state
                    }
                    is InboxResult.Success -> {
                        if (responseMatchesParams(revenueResult.data.flujoId, params.flujoId)) {
                            next = next.copy(revenueBreakdown = revenueResult.data)
                        }
                    }
                    is InboxResult.Error -> optionalErrors["revenue"] = revenueResult.message
                }

                next.copy(
                    optionalErrors = optionalErrors,
                    snackbarMessage = snackbarMessage ?: next.snackbarMessage,
                )
            }
        }
    }

    private fun buildQueryParams(state: MetricasUiState): MetricasQueryParams {
        return MetricasQueryParams(
            periodo = state.periodo,
            conexionWhatsappId = apiConexionParam(state.selectedConexionId),
            flujoId = normalizeFlujoId(state.selectedFlujoId),
        )
    }

    private fun apiConexionParam(selectedId: String): String? {
        return if (selectedId == InboxConstants.CONEXION_TODAS) null else selectedId.trim()
    }

    private fun normalizeFlujoId(flujoId: String?): String? {
        val trimmed = flujoId?.trim()
        return trimmed?.takeIf { it.isNotEmpty() }
    }

    private fun flowIdsMatch(left: String?, right: String?): Boolean {
        if (left == null || right == null) return false
        return left.trim().equals(right.trim(), ignoreCase = true)
    }

    private fun flowIdAllowed(flujoId: String, allowedIds: Set<String>): Boolean {
        return allowedIds.any { allowed -> flowIdsMatch(allowed, flujoId) }
    }

    private fun responseMatchesParams(responseFlujoId: String?, requestFlujoId: String?): Boolean {
        val requested = normalizeFlujoId(requestFlujoId)
        val responded = normalizeFlujoId(responseFlujoId)
        if (requested == null) return true
        if (responded == null) return true
        return flowIdsMatch(requested, responded)
    }

    private fun sortFlujosRanking(flujos: List<MetricasFlujoItem>): List<MetricasFlujoItem> {
        return flujos.sortedWith(
            compareByDescending<MetricasFlujoItem> { it.conversiones ?: 0 }
                .thenByDescending { it.actividad ?: 0 }
                .thenByDescending { flujoConversion(it) }
                .thenByDescending { it.leads ?: 0 },
        )
    }

    class Factory(
        private val metricasRepository: MetricasRepository,
        private val inboxRepository: InboxRepository,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return MetricasViewModel(
                metricasRepository = metricasRepository,
                inboxRepository = inboxRepository,
                onUnauthorized = onUnauthorized,
            ) as T
        }
    }
}

fun flujoConversion(flujo: MetricasFlujoItem): Double {
    val leads = flujo.leads ?: 0
    val ventas = flujo.conversiones ?: 0
    if (leads <= 0) return 0.0
    return (ventas.toDouble() / leads.toDouble()) * 100.0
}

fun selectedFlujoNombre(
    flujoId: String?,
    flujosLista: List<FlujoListaItem>,
    flujosRanking: List<MetricasFlujoItem>,
): String? {
    if (flujoId.isNullOrBlank()) return null
    return flujosLista.find { it.id.equals(flujoId, ignoreCase = true) }?.nombre
        ?: flujosRanking.find { it.flujoId.equals(flujoId, ignoreCase = true) }?.nombre
}
