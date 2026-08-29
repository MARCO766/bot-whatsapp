package com.macbot.app.ui.chat

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.ui.Alignment
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.di.AppContainer
import com.macbot.app.util.MediaKind
import com.macbot.app.util.docDisplayName
import com.macbot.app.util.docExtensionLabel
import com.macbot.app.util.formatFileSize
import com.macbot.app.util.formatDurationMs
import com.macbot.app.util.formatFechaHoraMensaje
import com.macbot.app.util.mediaUrl
import com.macbot.app.util.isPlaceholderContent
import com.macbot.app.util.messageChecksText
import com.macbot.app.util.messageDisplayText
import com.macbot.app.util.resolveMediaKind
import com.macbot.app.util.visibleCaption

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    numero: String,
    conexionWhatsappId: String,
    nombre: String,
    appContainer: AppContainer,
    onBack: () -> Unit,
    onUnauthorized: () -> Unit,
    onChatDeleted: (numero: String, conexionWhatsappId: String) -> Unit,
    viewModel: ChatViewModel = viewModel(
        factory = ChatViewModel.Factory(
            inboxRepository = appContainer.inboxRepository,
            etiquetasRepository = appContainer.etiquetasRepository,
            socketManager = appContainer.socketManager,
            openChatTracker = appContainer.openChatTracker,
            appContext = LocalContext.current.applicationContext,
            numero = numero,
            conexionWhatsappId = conexionWhatsappId,
            nombre = nombre,
            onUnauthorized = onUnauthorized,
        ),
    ),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    var draft by rememberSaveable { mutableStateOf("") }
    var fullScreenImageUrl by remember { mutableStateOf<String?>(null) }
    var showEtiquetaPicker by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showBlockDialog by remember { mutableStateOf(false) }
    var showChatActionsMenu by remember { mutableStateOf(false) }
    var blockSnackbarMessage by remember { mutableStateOf<String?>(null) }
    var copySnackbarMessage by remember { mutableStateOf<String?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    val mediaPlayer = rememberChatMediaPlayer()
    val context = LocalContext.current
    var pendingRecordAfterPermission by remember { mutableStateOf(false) }

    val recordPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted && pendingRecordAfterPermission) {
            viewModel.startVoiceRecording()
        } else if (!granted) {
            viewModel.clearSelectedVoiceNote()
        }
        pendingRecordAfterPermission = false
    }

    fun requestVoiceRecording() {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            viewModel.startVoiceRecording()
        } else {
            pendingRecordAfterPermission = true
            recordPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            viewModel.onImageSelected(uri)
        }
    }

    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            viewModel.onVideoSelected(uri)
        }
    }

    val audioMimeTypes = remember {
        arrayOf(
            "audio/*",
            "audio/mpeg",
            "audio/mp4",
            "audio/webm",
            "audio/ogg",
            "audio/wav",
        )
    }

    val audioPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            viewModel.onAudioSelected(uri)
        }
    }

    val documentMimeTypes = remember {
        arrayOf(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }

    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            viewModel.onDocumentSelected(uri)
        }
    }

    LaunchedEffect(uiState.mensajes.size, uiState.isLoading) {
        if (uiState.mensajes.isNotEmpty() && !uiState.isLoading) {
            listState.animateScrollToItem(uiState.mensajes.lastIndex)
        }
    }

    LaunchedEffect(blockSnackbarMessage) {
        val message = blockSnackbarMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message)
        blockSnackbarMessage = null
    }

    LaunchedEffect(copySnackbarMessage) {
        val message = copySnackbarMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message)
        copySnackbarMessage = null
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = uiState.nombre.ifBlank { uiState.numero },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = uiState.numero,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                        )
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showChatActionsMenu = true }) {
                            Icon(
                                imageVector = Icons.Default.MoreVert,
                                contentDescription = "Acciones del chat",
                            )
                        }
                        DropdownMenu(
                            expanded = showChatActionsMenu,
                            onDismissRequest = { showChatActionsMenu = false },
                        ) {
                            if (uiState.bloqueado) {
                                DropdownMenuItem(
                                    text = { Text("🔓 Desbloquear contacto") },
                                    onClick = {
                                        showChatActionsMenu = false
                                        showBlockDialog = true
                                    },
                                )
                            } else {
                                DropdownMenuItem(
                                    text = { Text("🚫 Bloquear contacto") },
                                    onClick = {
                                        showChatActionsMenu = false
                                        showBlockDialog = true
                                    },
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("🗑️ Eliminar chat") },
                                onClick = {
                                    showChatActionsMenu = false
                                    showDeleteDialog = true
                                },
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!uiState.isLoading && uiState.errorMessage == null) {
                if (uiState.ventana24hAbierta) {
                    ChatComposer(
                        value = draft,
                        onValueChange = { draft = it },
                        enabled = !uiState.isSending && !uiState.bloqueado,
                        isSending = uiState.isSending,
                        bloqueado = uiState.bloqueado,
                        sendErrorMessage = uiState.sendErrorMessage,
                        selectedImage = uiState.selectedImage,
                        selectedDocument = uiState.selectedDocument,
                        selectedVideo = uiState.selectedVideo,
                        selectedAudio = uiState.selectedAudio,
                        selectedVoiceNote = uiState.selectedVoiceNote,
                        isRecording = uiState.isRecording,
                        recordingDurationMs = uiState.recordingDurationMs,
                        recordingWillCancel = uiState.recordingWillCancel,
                        onAttachImage = {
                            imagePickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        onAttachVideo = {
                            videoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly),
                            )
                        },
                        onAttachAudio = {
                            audioPickerLauncher.launch(audioMimeTypes)
                        },
                        onAttachDocument = {
                            documentPickerLauncher.launch(documentMimeTypes)
                        },
                        onClearImage = viewModel::clearSelectedImage,
                        onClearDocument = viewModel::clearSelectedDocument,
                        onClearVideo = viewModel::clearSelectedVideo,
                        onClearAudio = viewModel::clearSelectedAudio,
                        onClearVoiceNote = viewModel::clearSelectedVoiceNote,
                        onRequestVoiceRecording = ::requestVoiceRecording,
                        onRecordingWillCancel = viewModel::setRecordingWillCancel,
                        onFinishVoiceRecording = viewModel::finishVoiceRecording,
                        onSend = {
                            viewModel.sendMessage(draft)
                            draft = ""
                        },
                    )
                } else {
                    ChatVentanaCerradaBar()
                }
            }
        },
        modifier = Modifier.imePadding(),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (!uiState.isLoading && uiState.errorMessage == null) {
                ChatFlujoSection(
                    botPausado = uiState.botPausado,
                    isActionInProgress = uiState.isFlujoActionInProgress,
                    errorMessage = uiState.flujoErrorMessage,
                    onApagar = viewModel::apagarFlujo,
                    onEncender = viewModel::encenderFlujo,
                )
                ChatEtiquetasSection(
                    etiquetasAsignadas = uiState.etiquetasAsignadas,
                    isLoading = uiState.isLoadingEtiquetas,
                    isActionInProgress = uiState.isEtiquetaActionInProgress,
                    errorMessage = uiState.etiquetaErrorMessage,
                    onAddClick = {
                        showEtiquetaPicker = true
                        viewModel.loadEtiquetasDisponibles()
                    },
                    onRemoveEtiqueta = viewModel::quitarEtiqueta,
                    onDismissError = viewModel::clearEtiquetaError,
                )
            }

            Box(modifier = Modifier.fillMaxSize()) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                uiState.errorMessage != null -> {
                    ChatErrorState(
                        message = uiState.errorMessage!!,
                        onRetry = viewModel::retry,
                    )
                }

                else -> {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (uiState.mensajes.isEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 48.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = "Sin mensajes todavía",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        } else {
                            items(
                                items = uiState.mensajes,
                                key = { msg ->
                                    msg.id ?: "${msg.creado_en}_${msg.contenido}_${msg.direccion}"
                                },
                            ) { message ->
                                MessageBubble(
                                    message = message,
                                    mediaPlayer = mediaPlayer,
                                    onImageClick = { url -> fullScreenImageUrl = url },
                                    onMessageCopied = { copySnackbarMessage = "Mensaje copiado" },
                                )
                            }
                        }
                    }
                }
            }
            }
        }

        fullScreenImageUrl?.let { imageUrl ->
            FullScreenImageViewer(
                imageUrl = imageUrl,
                onDismiss = { fullScreenImageUrl = null },
            )
        }

        ChatEtiquetaPickerSheet(
            visible = showEtiquetaPicker,
            etiquetasDisponibles = uiState.etiquetasDisponibles,
            etiquetasAsignadas = uiState.etiquetasAsignadas,
            isLoading = uiState.isLoadingEtiquetasDisponibles,
            isActionInProgress = uiState.isEtiquetaActionInProgress,
            onSelectEtiqueta = viewModel::asignarEtiqueta,
            onDismiss = { showEtiquetaPicker = false },
        )
    }

    if (uiState.isDeletingChat || uiState.isBlockActionInProgress) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
    }
    }

    if (showBlockDialog) {
        val isUnblock = uiState.bloqueado
        AlertDialog(
            onDismissRequest = {
                if (!uiState.isBlockActionInProgress) {
                    showBlockDialog = false
                    viewModel.clearBlockError()
                }
            },
            title = {
                Text(if (isUnblock) "¿Desbloquear contacto?" else "¿Bloquear contacto?")
            },
            text = {
                Column {
                    Text(
                        if (isUnblock) {
                            "El contacto podrá volver a interactuar con el flujo."
                        } else {
                            "El contacto no podrá continuar interactuando con el flujo mientras esté bloqueado."
                        },
                    )
                    if (uiState.blockErrorMessage != null) {
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(
                            text = uiState.blockErrorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val onSuccess = { message: String ->
                            showBlockDialog = false
                            viewModel.clearBlockError()
                            blockSnackbarMessage = message
                        }
                        if (isUnblock) {
                            viewModel.desbloquearContacto(onSuccess)
                        } else {
                            viewModel.bloquearContacto(onSuccess)
                        }
                    },
                    enabled = !uiState.isBlockActionInProgress,
                ) {
                    if (uiState.isBlockActionInProgress) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(
                            if (isUnblock) "Desbloquear" else "Bloquear",
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showBlockDialog = false
                        viewModel.clearBlockError()
                    },
                    enabled = !uiState.isBlockActionInProgress,
                ) {
                    Text("Cancelar")
                }
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!uiState.isDeletingChat) {
                    showDeleteDialog = false
                    viewModel.clearDeleteError()
                }
            },
            title = { Text("¿Eliminar conversación?") },
            text = {
                Column {
                    Text("Esta acción eliminará la conversación de la bandeja.")
                    if (uiState.deleteErrorMessage != null) {
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(
                            text = uiState.deleteErrorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.eliminarChat {
                            showDeleteDialog = false
                            onChatDeleted(uiState.numero, uiState.conexionWhatsappId)
                        }
                    },
                    enabled = !uiState.isDeletingChat,
                ) {
                    if (uiState.isDeletingChat) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Eliminar", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.clearDeleteError()
                    },
                    enabled = !uiState.isDeletingChat,
                ) {
                    Text("Cancelar")
                }
            },
        )
    }
}

@Composable
private fun ChatComposer(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    isSending: Boolean,
    bloqueado: Boolean,
    sendErrorMessage: String?,
    selectedImage: PendingImageSelection?,
    selectedDocument: PendingDocumentSelection?,
    selectedVideo: PendingVideoSelection?,
    selectedAudio: PendingAudioSelection?,
    selectedVoiceNote: PendingVoiceNoteSelection?,
    isRecording: Boolean,
    recordingDurationMs: Long,
    recordingWillCancel: Boolean,
    onAttachImage: () -> Unit,
    onAttachVideo: () -> Unit,
    onAttachAudio: () -> Unit,
    onAttachDocument: () -> Unit,
    onClearImage: () -> Unit,
    onClearDocument: () -> Unit,
    onClearVideo: () -> Unit,
    onClearAudio: () -> Unit,
    onClearVoiceNote: () -> Unit,
    onRequestVoiceRecording: () -> Unit,
    onRecordingWillCancel: (Boolean) -> Unit,
    onFinishVoiceRecording: () -> Unit,
    onSend: () -> Unit,
) {
    var showAttachMenu by remember { mutableStateOf(false) }
    val hasAttachment = selectedImage != null || selectedDocument != null ||
        selectedVideo != null || selectedAudio != null || selectedVoiceNote != null
    val canSend = enabled && !isRecording && (value.isNotBlank() || hasAttachment)

    Column {
        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
        if (sendErrorMessage != null) {
            Text(
                text = sendErrorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
        if (bloqueado) {
            Text(
                text = "Este chat está bloqueado",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
        if (isRecording) {
            RecordingIndicator(
                durationMs = recordingDurationMs,
                willCancel = recordingWillCancel,
            )
        }
        if (selectedImage != null) {
            ImageAttachmentPreview(
                image = selectedImage,
                onClear = onClearImage,
                enabled = enabled,
            )
        }
        if (selectedVideo != null) {
            VideoAttachmentPreview(
                video = selectedVideo,
                onClear = onClearVideo,
                enabled = enabled,
            )
        }
        if (selectedAudio != null) {
            AudioAttachmentPreview(
                audio = selectedAudio,
                onClear = onClearAudio,
                enabled = enabled,
            )
        }
        if (selectedVoiceNote != null) {
            VoiceNoteAttachmentPreview(
                voiceNote = selectedVoiceNote,
                onClear = onClearVoiceNote,
                enabled = enabled,
            )
        }
        if (selectedDocument != null) {
            DocumentAttachmentPreview(
                document = selectedDocument,
                onClear = onClearDocument,
                enabled = enabled,
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Box {
                IconButton(
                    onClick = { showAttachMenu = true },
                    enabled = enabled && !isRecording,
                ) {
                    Icon(
                        imageVector = Icons.Default.AttachFile,
                        contentDescription = "Adjuntar archivo",
                        tint = if (enabled && !isRecording) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
                DropdownMenu(
                    expanded = showAttachMenu,
                    onDismissRequest = { showAttachMenu = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Imagen") },
                        onClick = {
                            showAttachMenu = false
                            onAttachImage()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Video") },
                        onClick = {
                            showAttachMenu = false
                            onAttachVideo()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Audio") },
                        onClick = {
                            showAttachMenu = false
                            onAttachAudio()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Documento") },
                        onClick = {
                            showAttachMenu = false
                            onAttachDocument()
                        },
                    )
                }
            }
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = {
                    Text(
                        when {
                            isRecording -> "Grabando nota de voz…"
                            hasAttachment -> "Añade un caption (opcional)"
                            else -> "Escribe un mensaje"
                        },
                    )
                },
                enabled = enabled && !isRecording,
                maxLines = 4,
            )
            Spacer(modifier = Modifier.size(4.dp))
            VoiceRecordButton(
                enabled = enabled && !isSending && !bloqueado && !hasAttachment,
                isRecording = isRecording,
                onRequestRecording = onRequestVoiceRecording,
                onRecordingWillCancel = onRecordingWillCancel,
                onFinishRecording = onFinishVoiceRecording,
            )
            Spacer(modifier = Modifier.size(4.dp))
            IconButton(
                onClick = onSend,
                enabled = canSend,
            ) {
                if (isSending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Enviar",
                        tint = if (canSend) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun RecordingIndicator(
    durationMs: Long,
    willCancel: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(RoundedCornerShape(50))
                .background(if (willCancel) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
        )
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            text = if (willCancel) {
                "Suelta para cancelar · ${formatDurationMs(durationMs)}"
            } else {
                "Grabando ${formatDurationMs(durationMs)} · Desliza para cancelar"
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (willCancel) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

@Composable
private fun VoiceRecordButton(
    enabled: Boolean,
    isRecording: Boolean,
    onRequestRecording: () -> Unit,
    onRecordingWillCancel: (Boolean) -> Unit,
    onFinishRecording: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val longPress = awaitLongPressOrCancellation(down.id)
                    if (longPress == null) return@awaitEachGesture
                    onRequestRecording()

                    val pointerId = down.id
                    try {
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == pointerId }
                                ?: break
                            if (!change.pressed) break
                            val dragX = change.position.x - down.position.x
                            onRecordingWillCancel(dragX < -120f)
                        }
                    } finally {
                        onFinishRecording()
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Mic,
            contentDescription = "Grabar nota de voz",
            tint = when {
                isRecording -> MaterialTheme.colorScheme.error
                enabled -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

@Composable
private fun VideoAttachmentPreview(
    video: PendingVideoSelection,
    onClear: () -> Unit,
    enabled: Boolean,
) {
    val context = LocalContext.current
    val thumbnail = remember(video.uri) {
        loadVideoThumbnail(context, video.uri)
    }
    val fileName = video.displayName ?: "Video seleccionado"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(72.dp)
                .height(72.dp)
                .clip(RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (thumbnail != null) {
                Image(
                    bitmap = thumbnail.asImageBitmap(),
                    contentDescription = "Vista previa del video",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Icon(
                imageVector = Icons.Default.Videocam,
                contentDescription = null,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(24.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
            )
        }
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = fileName,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "VIDEO · ${formatFileSize(video.sizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Lista para enviar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onClear, enabled = enabled) {
            Icon(Icons.Default.Close, contentDescription = "Quitar video")
        }
    }
}

private fun loadVideoThumbnail(context: android.content.Context, uri: Uri): Bitmap? {
    return try {
        MediaMetadataRetriever().use { retriever ->
            retriever.setDataSource(context, uri)
            retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        }
    } catch (_: Exception) {
        null
    }
}

@Composable
private fun AudioAttachmentPreview(
    audio: PendingAudioSelection,
    onClear: () -> Unit,
    enabled: Boolean,
) {
    val fileName = audio.displayName ?: "Audio seleccionado"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Audiotrack,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = fileName,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "AUDIO · ${formatFileSize(audio.sizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Lista para enviar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onClear, enabled = enabled) {
            Icon(Icons.Default.Close, contentDescription = "Quitar audio")
        }
    }
}

@Composable
private fun VoiceNoteAttachmentPreview(
    voiceNote: PendingVoiceNoteSelection,
    onClear: () -> Unit,
    enabled: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Mic,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Nota de voz",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "${formatDurationMs(voiceNote.durationMs)} · ${formatFileSize(voiceNote.sizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Lista para enviar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onClear, enabled = enabled) {
            Icon(Icons.Default.Close, contentDescription = "Quitar nota de voz")
        }
    }
}

@Composable
private fun DocumentAttachmentPreview(
    document: PendingDocumentSelection,
    onClear: () -> Unit,
    enabled: Boolean,
) {
    val fileName = document.displayName ?: "Documento seleccionado"
    val extensionLabel = docExtensionLabel(fileName, document.mimeType)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Description,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = fileName,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "$extensionLabel · ${formatFileSize(document.sizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Lista para enviar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(
            onClick = onClear,
            enabled = enabled,
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Quitar documento",
            )
        }
    }
}

@Composable
private fun ImageAttachmentPreview(
    image: PendingImageSelection,
    onClear: () -> Unit,
    enabled: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = image.uri,
            contentDescription = image.displayName ?: "Vista previa",
            modifier = Modifier
                .width(72.dp)
                .heightIn(min = 72.dp, max = 72.dp)
                .clip(RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Crop,
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = image.displayName ?: "Imagen seleccionada",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "Lista para enviar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(
            onClick = onClear,
            enabled = enabled,
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Quitar imagen",
            )
        }
    }
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    mediaPlayer: ChatMediaPlayer,
    onImageClick: (String) -> Unit,
    onMessageCopied: () -> Unit,
) {
    when {
        message.isSistema() -> SystemMessageBubble(message)
        message.isSaliente() -> OutgoingMessageBubble(
            message = message,
            mediaPlayer = mediaPlayer,
            onImageClick = onImageClick,
            onMessageCopied = onMessageCopied,
        )
        else -> IncomingMessageBubble(
            message = message,
            mediaPlayer = mediaPlayer,
            onImageClick = onImageClick,
            onMessageCopied = onMessageCopied,
        )
    }
}

private fun copyableMessageText(message: ChatMessage): String? {
    val kind = resolveMediaKind(message)
    val url = mediaUrl(message)
    if (kind != null && url.isNotBlank()) {
        return visibleCaption(message, kind)
    }
    val text = message.contenido?.trim().orEmpty()
    if (text.isEmpty() || text.startsWith("http") || isPlaceholderContent(text)) {
        return null
    }
    return text
}

@Composable
private fun CopyableMessageBubble(
    message: ChatMessage,
    onMessageCopied: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    var showCopyMenu by remember(message.id, message.creado_en, message.contenido) {
        mutableStateOf(false)
    }
    val copyText = remember(message.id, message.creado_en, message.contenido) {
        copyableMessageText(message)
    }

    Box {
        Box(
            modifier = modifier.then(
                if (copyText != null) {
                    Modifier.pointerInput(message.id, message.creado_en, message.contenido) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            val longPress = awaitLongPressOrCancellation(down.id)
                            if (longPress != null) {
                                showCopyMenu = true
                            }
                        }
                    }
                } else {
                    Modifier
                },
            ),
        ) {
            content()
        }
        if (copyText != null) {
            DropdownMenu(
                expanded = showCopyMenu,
                onDismissRequest = { showCopyMenu = false },
            ) {
                DropdownMenuItem(
                    text = { Text("📋 Copiar") },
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("mensaje", copyText))
                        showCopyMenu = false
                        onMessageCopied()
                    },
                )
            }
        }
    }
}

@Composable
private fun SystemMessageBubble(message: ChatMessage) {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = messageDisplayText(message),
            modifier = Modifier
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp),
                )
                .padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun IncomingMessageBubble(
    message: ChatMessage,
    mediaPlayer: ChatMediaPlayer,
    onImageClick: (String) -> Unit,
    onMessageCopied: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        CopyableMessageBubble(
            message = message,
            onMessageCopied = onMessageCopied,
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Column(
                modifier = Modifier
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(
                            topStart = 4.dp,
                            topEnd = 16.dp,
                            bottomEnd = 16.dp,
                            bottomStart = 16.dp,
                        ),
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                MessageBubbleBody(message = message, mediaPlayer = mediaPlayer, onImageClick = onImageClick)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = formatFechaHoraMensaje(message.creado_en),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun OutgoingMessageBubble(
    message: ChatMessage,
    mediaPlayer: ChatMediaPlayer,
    onImageClick: (String) -> Unit,
    onMessageCopied: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
    ) {
        CopyableMessageBubble(
            message = message,
            onMessageCopied = onMessageCopied,
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Column(
                modifier = Modifier
                    .background(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(
                            topStart = 16.dp,
                            topEnd = 4.dp,
                            bottomEnd = 16.dp,
                            bottomStart = 16.dp,
                        ),
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                MessageBubbleBody(message = message, mediaPlayer = mediaPlayer, onImageClick = onImageClick)
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = formatFechaHoraMensaje(message.creado_en),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val checks = messageChecksText(message.estado_envio)
                    if (checks.isNotEmpty()) {
                        Spacer(modifier = Modifier.size(4.dp))
                        Text(
                            text = checks,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubbleBody(
    message: ChatMessage,
    mediaPlayer: ChatMediaPlayer,
    onImageClick: (String) -> Unit,
) {
    val kind = resolveMediaKind(message)
    val url = mediaUrl(message)
    if (kind == MediaKind.IMAGE && url.isNotBlank()) {
        ImageMessageContent(
            imageUrl = url,
            caption = visibleCaption(message, kind),
            onImageClick = { onImageClick(url) },
        )
        return
    }

    if (kind == MediaKind.VIDEO && url.isNotBlank()) {
        VideoMessageContent(
            videoUrl = url,
            caption = visibleCaption(message, kind),
            mediaPlayer = mediaPlayer,
        )
        return
    }

    if (kind == MediaKind.AUDIO && url.isNotBlank()) {
        AudioMessageContent(
            audioUrl = url,
            caption = visibleCaption(message, kind),
            mediaPlayer = mediaPlayer,
        )
        return
    }

    if (kind == MediaKind.DOCUMENT && url.isNotBlank()) {
        val displayName = docDisplayName(message)
        DocumentMessageContent(
            documentUrl = url,
            displayName = displayName,
            extensionLabel = docExtensionLabel(displayName, message.mime_type),
            caption = visibleCaption(message, kind),
        )
        return
    }

    Text(
        text = messageDisplayText(message),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
}

@Composable
private fun ChatErrorState(
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
