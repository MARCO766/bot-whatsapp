package com.macbot.app.ui.metricas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.FlujoListaItem
import com.macbot.app.data.api.model.MetricasDiagnosticoItem
import com.macbot.app.data.api.model.MetricasFlujoItem
import com.macbot.app.data.api.model.MetricasFunnelEtapa
import com.macbot.app.data.api.model.MetricasHeatmapHora
import com.macbot.app.data.api.model.MetricasKpis
import com.macbot.app.data.api.model.MetricasSerieDia
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.inbox.InboxConstants
import com.macbot.app.ui.theme.MacGreen
import com.macbot.app.util.formatMetricasMoney
import com.macbot.app.util.formatMetricasNumber
import com.macbot.app.util.formatMetricasPct
import com.macbot.app.util.formatMetricasTendencia

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MetricasScreen(
    appContainer: AppContainer,
    onUnauthorized: () -> Unit,
    viewModel: MetricasViewModel = viewModel(
        factory = MetricasViewModel.Factory(
            metricasRepository = appContainer.metricasRepository,
            inboxRepository = appContainer.inboxRepository,
            onUnauthorized = onUnauthorized,
        ),
    ),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val flujoNombre = selectedFlujoNombre(
        flujoId = uiState.selectedFlujoId,
        flujosLista = uiState.flujosLista,
        flujosRanking = uiState.flujosRanking,
    )

    LaunchedEffect(uiState.snackbarMessage) {
        val message = uiState.snackbarMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message)
        viewModel.clearSnackbarMessage()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Métricas", style = MaterialTheme.typography.titleLarge)
                            if (uiState.isUpdating) {
                                Spacer(modifier = Modifier.width(8.dp))
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Actualizando…",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Text(
                            text = buildSubtitle(uiState.periodoLabel, flujoNombre),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.refresh() },
                        enabled = !uiState.isRefreshing && !uiState.isLoading && !uiState.isUpdating,
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Actualizar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                uiState.isLoading && uiState.kpis == null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                uiState.mainError != null && uiState.kpis == null -> {
                    MetricasErrorState(
                        message = uiState.mainError!!,
                        onRetry = viewModel::retry,
                    )
                }

                else -> {
                    MetricasContent(
                        uiState = uiState,
                        flujoNombre = flujoNombre,
                        onSelectPeriodo = viewModel::selectPeriodo,
                        onSelectConexion = viewModel::selectConexion,
                        onSelectFlujo = viewModel::selectFlujo,
                        onClearFlujo = viewModel::clearFlujoFilter,
                    )
                }
            }
        }
    }
}

private fun buildSubtitle(periodoLabel: String, flujoNombre: String?): String {
    return if (flujoNombre != null) {
        "$periodoLabel · Métricas de: $flujoNombre"
    } else {
        periodoLabel
    }
}

@Composable
private fun MetricasContent(
    uiState: MetricasUiState,
    flujoNombre: String?,
    onSelectPeriodo: (String) -> Unit,
    onSelectConexion: (String) -> Unit,
    onSelectFlujo: (String?) -> Unit,
    onClearFlujo: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            MetricasPeriodoRow(
                selected = uiState.periodo,
                onSelect = onSelectPeriodo,
            )
        }

        item {
            MetricasConexionFilterRow(
                conexiones = uiState.conexiones,
                selectedId = uiState.selectedConexionId,
                onSelect = onSelectConexion,
            )
        }

        item {
            MetricasFlujoFilterRow(
                flujos = uiState.flujosLista,
                selectedFlujoId = uiState.selectedFlujoId,
                onSelect = onSelectFlujo,
            )
        }

        if (flujoNombre != null) {
            item {
                MetricasFlujoBanner(
                    nombre = flujoNombre,
                    onClear = onClearFlujo,
                )
            }
        }

        if (uiState.mainError != null) {
            item {
                Text(
                    text = uiState.mainError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        if (uiState.isUpdating) {
            item {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        if (uiState.kpis != null) {
            item {
                MetricasKpiSection(kpis = uiState.kpis!!)
            }
        }

        if (uiState.flujosRanking.isNotEmpty() && uiState.selectedFlujoId == null) {
            item {
                MetricasFlujosSection(
                    flujos = uiState.flujosRanking,
                    onFlujoClick = onSelectFlujo,
                )
            }
        }

        item {
            MetricasSeriesSection(
                diario = uiState.series?.diario.orEmpty(),
                moneda = uiState.kpis?.moneda,
                error = uiState.optionalErrors["series"],
            )
        }

        item {
            MetricasFunnelSection(
                etapas = uiState.funnel?.etapas.orEmpty(),
                vacio = uiState.funnel?.vacio == true,
                error = uiState.optionalErrors["embudo"],
            )
        }

        uiState.diagnostico?.items?.takeIf { it.isNotEmpty() }?.let { items ->
            item {
                MetricasDiagnosticoSection(items = items)
            }
        }

        uiState.heatmap?.heatmap?.horas?.takeIf { it.isNotEmpty() }?.let { horas ->
            item {
                MetricasHeatmapSection(
                    horas = horas,
                    max = uiState.heatmap?.heatmap?.max ?: 0,
                    error = uiState.optionalErrors["heatmap"],
                )
            }
        }

        uiState.revenueBreakdown?.porMoneda?.takeIf { it.isNotEmpty() }?.let { porMoneda ->
            item {
                MetricasRevenueSection(
                    porMoneda = porMoneda,
                    error = uiState.optionalErrors["revenue"],
                )
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun MetricasPeriodoRow(
    selected: String,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(MetricasPeriodos.OPTIONS) { (id, label) ->
            FilterChip(
                selected = selected == id,
                onClick = { onSelect(id) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun MetricasConexionFilterRow(
    conexiones: List<ConexionWhatsapp>,
    selectedId: String,
    onSelect: (String) -> Unit,
) {
    if (conexiones.isEmpty()) return

    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        item {
            FilterChip(
                selected = selectedId == InboxConstants.CONEXION_TODAS,
                onClick = { onSelect(InboxConstants.CONEXION_TODAS) },
                label = { Text("Todas") },
            )
        }
        items(conexiones, key = { it.id }) { conexion ->
            val label = metricasConexionLabel(conexion)
            FilterChip(
                selected = selectedId == conexion.id,
                onClick = { onSelect(conexion.id) },
                label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}

@Composable
private fun MetricasFlujoFilterRow(
    flujos: List<FlujoListaItem>,
    selectedFlujoId: String?,
    onSelect: (String?) -> Unit,
) {
    if (flujos.isEmpty()) return

    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        item {
            FilterChip(
                selected = selectedFlujoId == null,
                onClick = { onSelect(null) },
                label = { Text("Todos los flujos") },
            )
        }
        items(flujos, key = { it.id ?: it.nombre ?: "" }) { flujo ->
            val id = flujo.id ?: return@items
            FilterChip(
                selected = selectedFlujoId.equals(id, ignoreCase = true),
                onClick = { onSelect(id) },
                label = {
                    Text(
                        flujo.nombre ?: "Flujo",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }
    }
}

@Composable
private fun MetricasFlujoBanner(
    nombre: String,
    onClear: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .clickable(onClick = onClear)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Métricas de: $nombre",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "Todos los flujos",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MetricasKpiSection(kpis: MetricasKpis) {
    SectionCard(title = "Indicadores principales") {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            KpiTile("Leads", formatMetricasNumber(kpis.leads), formatMetricasTendencia(kpis.tendenciaLeads))
            KpiTile("Conversaciones", formatMetricasNumber(kpis.conversaciones), formatMetricasTendencia(kpis.tendenciaConversaciones))
            KpiTile("Mensajes enviados", formatMetricasNumber(kpis.mensajesEnviados))
            KpiTile("Mensajes recibidos", formatMetricasNumber(kpis.mensajesEntrantes))
            KpiTile("Respuestas", formatMetricasNumber(kpis.respuestas))
            KpiTile("Ventas", formatMetricasNumber(kpis.ventas), formatMetricasTendencia(kpis.tendenciaVentas))
            KpiTile("Ingresos", formatMetricasMoney(kpis.ingresos, kpis.moneda))
            KpiTile("Tasa de cierre", formatMetricasPct(kpis.tasaCierre))
            KpiTile("Conversión", formatMetricasPct(kpis.conversion))
        }

        val seguimientos = listOfNotNull(
            kpis.seguimientosEnviados?.let { "Enviados: ${formatMetricasNumber(it)}" },
            kpis.seguimientosRespondidos?.let { "Respondidos: ${formatMetricasNumber(it)}" },
            kpis.seguimientosCancelados?.let { "Cancelados: ${formatMetricasNumber(it)}" },
            kpis.seguimientosActivos?.let { "Activos: ${formatMetricasNumber(it)}" },
        )
        if (seguimientos.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Seguimientos: ${seguimientos.joinToString(" · ")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun KpiTile(
    label: String,
    value: String,
    tendencia: String? = null,
) {
    Column(
        modifier = Modifier
            .width(156.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(12.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        if (tendencia != null) {
            Text(
                text = tendencia,
                style = MaterialTheme.typography.labelSmall,
                color = if (tendencia.startsWith("-")) Color(0xFFEF4444) else MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun MetricasFlujosSection(
    flujos: List<MetricasFlujoItem>,
    onFlujoClick: (String?) -> Unit,
) {
    SectionCard(
        title = "Rendimiento por flujo",
        subtitle = "Toca un flujo para filtrar las métricas generales",
    ) {
        flujos.forEach { flujo ->
            val id = flujo.flujoId ?: return@forEach
            MetricasFlujoCard(
                flujo = flujo,
                onClick = { onFlujoClick(id) },
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun MetricasFlujoCard(
    flujo: MetricasFlujoItem,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Text(
            text = flujo.nombre ?: "Flujo",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            FlujoStat("Leads", formatMetricasNumber(flujo.leads))
            FlujoStat("Ventas", formatMetricasNumber(flujo.conversiones))
            FlujoStat("Respuestas", formatMetricasNumber(flujo.respuestas))
            FlujoStat("Conversión", formatMetricasPct(flujoConversion(flujo)))
        }
        if ((flujo.actividad ?: 0) > 0) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Actividad: ${formatMetricasNumber(flujo.actividad)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FlujoStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MetricasSeriesSection(
    diario: List<MetricasSerieDia>,
    moneda: String?,
    error: String?,
) {
    SectionCard(title = "Evolución") {
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            return@SectionCard
        }
        if (diario.isEmpty() || diario.all { (it.leads ?: 0) == 0 && (it.ventas ?: 0) == 0 && (it.mensajes ?: 0) == 0 }) {
            Text(
                text = "Sin actividad en el periodo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@SectionCard
        }

        MiniBarChart(
            label = "Leads",
            data = diario,
            valueSelector = { it.leads ?: 0 },
            barColor = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.height(12.dp))
        MiniBarChart(
            label = "Mensajes",
            data = diario,
            valueSelector = { it.mensajes ?: 0 },
            barColor = Color(0xFF06B6D4),
        )
        Spacer(modifier = Modifier.height(12.dp))
        MiniBarChart(
            label = "Ventas",
            data = diario,
            valueSelector = { it.ventas ?: 0 },
            barColor = Color(0xFFA855F7),
        )
        val totalIngresos = diario.sumOf { it.ingresos ?: 0.0 }
        if (totalIngresos > 0) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Ingresos del periodo: ${formatMetricasMoney(totalIngresos, moneda)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MiniBarChart(
    label: String,
    data: List<MetricasSerieDia>,
    valueSelector: (MetricasSerieDia) -> Int,
    barColor: Color,
) {
    val max = data.maxOfOrNull { valueSelector(it) }?.coerceAtLeast(1) ?: 1
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            data.forEach { day ->
                val value = valueSelector(day)
                val heightFraction = if (max > 0) value.toFloat() / max.toFloat() else 0f
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height((heightFraction * 56).dp.coerceAtLeast(if (value > 0) 3.dp else 0.dp))
                            .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                            .background(barColor.copy(alpha = if (value > 0) 0.85f else 0.15f)),
                    )
                    val fechaLabel = day.fecha?.takeLast(5) ?: ""
                    if (data.size <= 14) {
                        Text(
                            text = fechaLabel,
                            fontSize = 8.sp,
                            maxLines = 1,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricasFunnelSection(
    etapas: List<MetricasFunnelEtapa>,
    vacio: Boolean,
    error: String?,
) {
    SectionCard(title = "Embudo") {
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            return@SectionCard
        }
        if (vacio || etapas.isEmpty()) {
            Text(
                text = "Sin datos de embudo en el periodo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@SectionCard
        }

        etapas.forEach { etapa ->
            FunnelRow(etapa = etapa)
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun FunnelRow(etapa: MetricasFunnelEtapa) {
    val cantidad = etapa.cantidad ?: 0
    val pctBar = (etapa.porcentaje ?: 0).coerceIn(0, 100)
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = etapa.nombre ?: "Etapa",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = formatMetricasNumber(cantidad),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { pctBar / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp)),
            color = funnelColor(etapa.color),
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        val tasa = etapa.tasaVsLeads ?: 0.0
        if (tasa > 0) {
            Text(
                text = "${formatMetricasPct(tasa)} vs leads",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MetricasDiagnosticoSection(items: List<MetricasDiagnosticoItem>) {
    SectionCard(title = "Diagnóstico") {
        items.forEach { item ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                val icon = when (item.tipo) {
                    "ok" -> "✓"
                    "alerta" -> "!"
                    else -> "i"
                }
                val tint = when (item.tipo) {
                    "ok" -> MaterialTheme.colorScheme.primary
                    "alerta" -> Color(0xFFF59E0B)
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                Text(
                    text = icon,
                    modifier = Modifier
                        .size(22.dp)
                        .padding(end = 4.dp),
                    color = tint,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = item.texto ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun MetricasHeatmapSection(
    horas: List<MetricasHeatmapHora>,
    max: Int,
    error: String?,
) {
    SectionCard(title = "Actividad por hora") {
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            return@SectionCard
        }
        if (max <= 0) {
            Text(
                text = "Sin actividad horaria en el periodo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@SectionCard
        }

        val columns = 6
        horas.chunked(columns).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                row.forEach { h ->
                    val intensity = if (max > 0) (h.total ?: 0).toFloat() / max.toFloat() else 0f
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f + intensity * 0.75f))
                            .padding(vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "${h.hora ?: 0}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = formatMetricasNumber(h.total),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                repeat(columns - row.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}

@Composable
private fun MetricasRevenueSection(
    porMoneda: Map<String, com.macbot.app.data.api.model.MetricasRevenueMoneda>,
    error: String?,
) {
    SectionCard(title = "Desglose de ingresos") {
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            return@SectionCard
        }

        porMoneda.forEach { (moneda, bucket) ->
            val cantidad = bucket.kpis?.totalCantidad ?: bucket.total?.cantidad ?: 0
            val ingresos = bucket.kpis?.totalIngresos ?: bucket.total?.ingresos ?: 0.0
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = moneda,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${formatMetricasNumber(cantidad)} ventas · ${formatMetricasMoney(ingresos, moneda)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    subtitle: String? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        if (subtitle != null) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun MetricasErrorState(
    message: String,
    onRetry: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRetry) {
                Text("Reintentar")
            }
        }
    }
}

private fun metricasConexionLabel(conexion: ConexionWhatsapp): String {
    val nombre = conexion.nombre?.trim().orEmpty()
    if (nombre.isNotEmpty()) return nombre
    val numero = conexion.numero?.trim().orEmpty()
    if (numero.isNotEmpty()) return numero
    val phoneSuffix = conexion.phone_id?.takeLast(4).orEmpty()
    return if (phoneSuffix.isNotEmpty()) "Línea $phoneSuffix" else "Línea"
}

private fun funnelColor(color: String?): Color {
    return when (color) {
        "blue" -> Color(0xFF3B82F6)
        "cyan" -> Color(0xFF06B6D4)
        "green" -> MacGreen
        "orange" -> Color(0xFFF59E0B)
        "purple" -> Color(0xFFA855F7)
        else -> MacGreen
    }
}
