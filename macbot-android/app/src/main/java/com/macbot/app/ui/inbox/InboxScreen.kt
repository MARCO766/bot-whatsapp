package com.macbot.app.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.InboxChat
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.theme.MacGreen
import com.macbot.app.ui.theme.MacGreenLight
import com.macbot.app.util.contactInitial
import com.macbot.app.util.formatFechaListaChat
import kotlinx.coroutines.flow.distinctUntilChanged

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(
    appContainer: AppContainer,
    onUnauthorized: () -> Unit,
    onChatClick: (numero: String, conexionWhatsappId: String, nombre: String) -> Unit,
    viewModel: InboxViewModel = viewModel(
        factory = InboxViewModel.Factory(
            inboxRepository = appContainer.inboxRepository,
            onUnauthorized = onUnauthorized,
        ),
    ),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(listState, uiState.chats.size, uiState.hasMore) {
        snapshotFlow {
            val info = listState.layoutInfo
            val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible to info.totalItemsCount
        }
            .distinctUntilChanged()
            .collect { (lastVisible, total) ->
                if (total > 0 && lastVisible >= total - 3) {
                    viewModel.loadMore()
                }
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Bandeja", style = MaterialTheme.typography.titleLarge)
                        if (uiState.totalNoLeidos > 0) {
                            Text(
                                text = "${uiState.totalNoLeidos} sin leer",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
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
                uiState.isLoading && uiState.chats.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MacGreen)
                    }
                }

                uiState.errorMessage != null && uiState.chats.isEmpty() -> {
                    ErrorState(
                        message = uiState.errorMessage!!,
                        onRetry = viewModel::retry,
                    )
                }

                else -> {
                    Column(modifier = Modifier.fillMaxSize()) {
                        ConexionFilterRow(
                            conexiones = uiState.conexiones,
                            selectedId = uiState.selectedConexionId,
                            onSelect = viewModel::selectConexion,
                        )

                        if (uiState.errorMessage != null) {
                            Text(
                                text = uiState.errorMessage!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }

                        if (uiState.chats.isEmpty() && !uiState.isLoading) {
                            EmptyInboxState()
                        } else {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(bottom = 16.dp),
                            ) {
                                items(
                                    items = uiState.chats,
                                    key = { chat ->
                                        chat.chatKey
                                            ?: "${chat.effectiveNumero()}_${chat.effectiveConexionId()}"
                                    },
                                ) { chat ->
                                    ConversationItem(
                                        chat = chat,
                                        onClick = {
                                            val numero = chat.effectiveNumero()
                                            val conexionId = chat.effectiveConexionId()
                                            if (numero.isNotBlank() && conexionId.isNotBlank()) {
                                                onChatClick(numero, conexionId, chat.displayName())
                                            }
                                        },
                                    )
                                    HorizontalDivider(
                                        modifier = Modifier.padding(start = 76.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant,
                                    )
                                }

                                if (uiState.isLoadingMore) {
                                    item {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(16.dp),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(28.dp),
                                                strokeWidth = 2.dp,
                                                color = MacGreen,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConexionFilterRow(
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
            val label = conexionLabel(conexion)
            FilterChip(
                selected = selectedId == conexion.id,
                onClick = { onSelect(conexion.id) },
                label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}

private fun conexionLabel(conexion: ConexionWhatsapp): String {
    val nombre = conexion.nombre?.trim().orEmpty()
    if (nombre.isNotEmpty()) return nombre
    val numero = conexion.numero?.trim().orEmpty()
    if (numero.isNotEmpty()) return numero
    val phoneSuffix = conexion.phone_id?.takeLast(4).orEmpty()
    return if (phoneSuffix.isNotEmpty()) "Línea $phoneSuffix" else "Línea"
}

@Composable
private fun ConversationItem(
    chat: InboxChat,
    onClick: () -> Unit,
) {
    val unread = chat.noLeidos ?: 0
    val hasUnread = unread > 0
    val displayName = chat.displayName()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (hasUnread) MacGreenLight.copy(alpha = 0.35f)
                else MaterialTheme.colorScheme.surface,
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(if (hasUnread) MacGreen else MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = contactInitial(displayName),
                color = if (hasUnread) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onPrimaryContainer
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (hasUnread) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = formatFechaListaChat(chat.ultimoMensajeEn),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (hasUnread) MacGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = chat.ultimoMensaje?.ifBlank { "Sin mensajes" } ?: "Sin mensajes",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = if (hasUnread) FontWeight.Medium else FontWeight.Normal,
                    modifier = Modifier.weight(1f),
                )

                if (hasUnread) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(MacGreen, CircleShape)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (unread > 99) "99+" else unread.toString(),
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyInboxState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Sin conversaciones",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Cuando recibas mensajes de WhatsApp aparecerán aquí.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ErrorState(
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
