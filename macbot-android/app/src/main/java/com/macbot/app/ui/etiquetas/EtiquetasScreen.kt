package com.macbot.app.ui.etiquetas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.EtiquetaItem
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.inbox.InboxConstants
import com.macbot.app.util.parseHexColor

private val EtiquetaPresetColors = listOf(
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#a855f7",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#84cc16",
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun EtiquetasScreen(
    appContainer: AppContainer,
    onUnauthorized: () -> Unit,
    onTagClick: (nombre: String, color: String, conexionWhatsappId: String) -> Unit,
    viewModel: EtiquetasViewModel = viewModel(
        factory = EtiquetasViewModel.Factory(
            etiquetasRepository = appContainer.etiquetasRepository,
            inboxRepository = appContainer.inboxRepository,
            onUnauthorized = onUnauthorized,
        ),
    ),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val mostrarBadgeLinea = uiState.selectedConexionId == InboxConstants.CONEXION_TODAS

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Etiquetas", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    IconButton(
                        onClick = { viewModel.refresh() },
                        enabled = !uiState.isRefreshing && !uiState.isLoading,
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Actualizar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        floatingActionButton = {
            if (viewModel.puedeCrear) {
                FloatingActionButton(
                    onClick = { viewModel.openCreateDialog() },
                    containerColor = MaterialTheme.colorScheme.primary,
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Nueva etiqueta")
                }
            }
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
                uiState.isLoading && uiState.etiquetas.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                uiState.errorMessage != null && uiState.etiquetas.isEmpty() -> {
                    EtiquetasErrorState(
                        message = uiState.errorMessage!!,
                        onRetry = viewModel::retry,
                    )
                }

                else -> {
                    Column(modifier = Modifier.fillMaxSize()) {
                        EtiquetasConexionFilterRow(
                            conexiones = uiState.conexiones,
                            selectedId = uiState.selectedConexionId,
                            onSelect = viewModel::selectConexion,
                        )

                        if (!viewModel.puedeCrear && uiState.selectedConexionId == InboxConstants.CONEXION_TODAS) {
                            Text(
                                text = "Para crear etiquetas, selecciona una línea WhatsApp.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            )
                        }

                        if (uiState.errorMessage != null) {
                            Text(
                                text = uiState.errorMessage!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }

                        if (uiState.etiquetas.isEmpty() && !uiState.isLoading) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "No hay etiquetas en esta vista.",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                items(uiState.etiquetas, key = { it.id ?: it.nombre.orEmpty() }) { tag ->
                                    EtiquetaListItem(
                                        tag = tag,
                                        showLinea = mostrarBadgeLinea,
                                        onClick = {
                                            val nombre = tag.nombre.orEmpty()
                                            val conexionId = tag.effectiveConexionId()
                                            if (nombre.isNotBlank() && conexionId.isNotBlank()) {
                                                onTagClick(nombre, tag.displayColor(), conexionId)
                                            }
                                        },
                                        onEdit = { viewModel.openEditDialog(tag) },
                                        onDelete = { viewModel.openDeleteDialog(tag) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (uiState.showCreateDialog) {
        EtiquetaFormDialog(
            title = "Nueva etiqueta",
            initialNombre = "",
            initialColor = "#22c55e",
            isSaving = uiState.isSaving,
            errorMessage = uiState.createError,
            onDismiss = viewModel::closeCreateDialog,
            onConfirm = viewModel::createEtiqueta,
        )
    }

    uiState.editingTag?.let { tag ->
        EtiquetaFormDialog(
            title = "Editar etiqueta",
            initialNombre = tag.nombre.orEmpty(),
            initialColor = tag.displayColor(),
            isSaving = uiState.isSaving,
            errorMessage = uiState.editError,
            onDismiss = viewModel::closeEditDialog,
            onConfirm = viewModel::updateEtiqueta,
        )
    }

    uiState.deletingTag?.let { tag ->
        DeleteEtiquetaDialog(
            nombre = tag.nombre.orEmpty(),
            isSaving = uiState.isSaving,
            errorMessage = uiState.deleteError,
            onDismiss = viewModel::closeDeleteDialog,
            onConfirm = viewModel::confirmDeleteEtiqueta,
        )
    }
}

@Composable
private fun EtiquetasConexionFilterRow(
    conexiones: List<ConexionWhatsapp>,
    selectedId: String,
    onSelect: (String) -> Unit,
) {
    if (conexiones.isEmpty()) return

    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FilterChip(
                selected = selectedId == InboxConstants.CONEXION_TODAS,
                onClick = { onSelect(InboxConstants.CONEXION_TODAS) },
                label = { Text("Todas") },
            )
        }
        items(conexiones, key = { it.id }) { conexion ->
            val label = etiquetasConexionLabel(conexion)
            FilterChip(
                selected = selectedId == conexion.id,
                onClick = { onSelect(conexion.id) },
                label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}

private fun etiquetasConexionLabel(conexion: ConexionWhatsapp): String {
    val nombre = conexion.nombre?.trim().orEmpty()
    if (nombre.isNotEmpty()) return nombre
    val numero = conexion.numero?.trim().orEmpty()
    if (numero.isNotEmpty()) return numero
    val phoneSuffix = conexion.phone_id?.takeLast(4).orEmpty()
    return if (phoneSuffix.isNotEmpty()) "Línea $phoneSuffix" else "Línea"
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EtiquetaListItem(
    tag: EtiquetaItem,
    showLinea: Boolean,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val tagColor = parseHexColor(tag.displayColor(), MaterialTheme.colorScheme.primary)
    val leads = tag.leadsCount ?: 0
    val canManage = tag.id != null && tag.effectiveConexionId().isNotBlank()
    var menuExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .combinedClickable(
                onClick = onClick,
                onLongClick = {
                    if (canManage) {
                        menuExpanded = true
                    }
                },
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(CircleShape)
                .background(tagColor),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = tag.nombre.orEmpty(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (showLinea && !tag.conexion_nombre.isNullOrBlank()) {
                Text(
                    text = tag.conexion_nombre!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "$leads",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (canManage) {
            Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Icon(
                        Icons.Default.MoreVert,
                        contentDescription = "Opciones",
                    )
                }
                DropdownMenu(
                    expanded = menuExpanded,
                    onDismissRequest = { menuExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Editar") },
                        onClick = {
                            menuExpanded = false
                            onEdit()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Eliminar") },
                        onClick = {
                            menuExpanded = false
                            onDelete()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun EtiquetaColorPicker(
    selectedColor: String,
    onColorSelected: (String) -> Unit,
    enabled: Boolean,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(EtiquetaPresetColors) { hex ->
            val color = parseHexColor(hex, MaterialTheme.colorScheme.primary)
            val selected = selectedColor.lowercase() == hex.lowercase()
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(color)
                    .then(
                        if (selected) {
                            Modifier.border(2.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                        } else {
                            Modifier
                        },
                    )
                    .clickable(enabled = enabled) { onColorSelected(hex) },
            )
        }
    }
}

@Composable
private fun EtiquetaFormDialog(
    title: String,
    initialNombre: String,
    initialColor: String,
    isSaving: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onConfirm: (nombre: String, color: String) -> Unit,
) {
    var nombre by remember(initialNombre) { mutableStateOf(initialNombre) }
    var colorHex by remember(initialColor) { mutableStateOf(initialColor) }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = nombre,
                    onValueChange = { nombre = it },
                    label = { Text("Nombre") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isSaving,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Color",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                EtiquetaColorPicker(
                    selectedColor = colorHex,
                    onColorSelected = { colorHex = it },
                    enabled = !isSaving,
                )
                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(nombre, colorHex) },
                enabled = !isSaving && nombre.isNotBlank(),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(if (title.contains("Editar")) "Guardar" else "Crear")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancelar")
            }
        },
    )
}

@Composable
private fun DeleteEtiquetaDialog(
    nombre: String,
    isSaving: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text("¿Eliminar etiqueta?") },
        text = {
            Column {
                Text(
                    text = "Se eliminará \"$nombre\". Esta acción no se puede deshacer.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !isSaving) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Eliminar")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancelar")
            }
        },
    )
}

@Composable
private fun EtiquetasErrorState(
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
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRetry) {
                Text("Reintentar")
            }
        }
    }
}
