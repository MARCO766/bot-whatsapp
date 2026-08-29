package com.macbot.app.ui.chat

import android.content.Context
import android.net.Uri
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.data.api.model.EtiquetaItem
import com.macbot.app.data.api.model.InboxChatEtiqueta
import com.macbot.app.data.realtime.ChatKey
import com.macbot.app.data.realtime.MacBotSocketManager
import com.macbot.app.data.realtime.OpenChatTracker
import com.macbot.app.data.realtime.SocketEvent
import com.macbot.app.data.repository.EtiquetasRepository
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.InboxResult
import com.macbot.app.util.calcularVentana24h
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ChatUiState(
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val nombre: String = "",
    val numero: String = "",
    val conexionWhatsappId: String = "",
    val bloqueado: Boolean = false,
    val mensajes: List<ChatMessage> = emptyList(),
    val errorMessage: String? = null,
    val sendErrorMessage: String? = null,
    val selectedImage: PendingImageSelection? = null,
    val selectedDocument: PendingDocumentSelection? = null,
    val selectedVideo: PendingVideoSelection? = null,
    val selectedAudio: PendingAudioSelection? = null,
    val selectedVoiceNote: PendingVoiceNoteSelection? = null,
    val isRecording: Boolean = false,
    val recordingDurationMs: Long = 0L,
    val recordingWillCancel: Boolean = false,
    val etiquetasAsignadas: List<InboxChatEtiqueta> = emptyList(),
    val etiquetasDisponibles: List<EtiquetaItem> = emptyList(),
    val isLoadingEtiquetas: Boolean = false,
    val isLoadingEtiquetasDisponibles: Boolean = false,
    val isEtiquetaActionInProgress: Boolean = false,
    val etiquetaErrorMessage: String? = null,
    val ventana24hAbierta: Boolean = true,
    val botPausado: Boolean = false,
    val isFlujoActionInProgress: Boolean = false,
    val flujoErrorMessage: String? = null,
    val isDeletingChat: Boolean = false,
    val deleteErrorMessage: String? = null,
    val isBlockActionInProgress: Boolean = false,
    val blockErrorMessage: String? = null,
)

class ChatViewModel(
    private val inboxRepository: InboxRepository,
    private val etiquetasRepository: EtiquetasRepository,
    private val socketManager: MacBotSocketManager,
    private val openChatTracker: OpenChatTracker,
    private val voiceRecorder: VoiceRecorder,
    private val numero: String,
    private val conexionWhatsappId: String,
    nombreInicial: String,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        ChatUiState(
            nombre = nombreInicial.ifBlank { numero },
            numero = numero,
            conexionWhatsappId = conexionWhatsappId,
        ),
    )
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()
    private val chatKey = ChatKey.build(numero, conexionWhatsappId)
    private var awaitingSendConfirmation = false
    private var pendingSendText: String? = null
    private var sendFallbackJob: Job? = null
    private var recordingTickerJob: Job? = null
    private var ventanaTickerJob: Job? = null
    private var recordingStartedAtMs: Long = 0L

    init {
        openChatTracker.setOpenChat(numero, conexionWhatsappId)
        observeSocketEvents()
        loadChat()
        loadEtiquetasAsignadas()
    }

    override fun onCleared() {
        openChatTracker.clearOpenChat()
        sendFallbackJob?.cancel()
        recordingTickerJob?.cancel()
        ventanaTickerJob?.cancel()
        voiceRecorder.cancel()
        super.onCleared()
    }

    private fun observeSocketEvents() {
        viewModelScope.launch {
            socketManager.events.collect { event ->
                when (event) {
                    is SocketEvent.NuevoMensaje -> handleNuevoMensaje(event.message)
                    is SocketEvent.MensajeEstado -> handleMensajeEstado(event)
                    is SocketEvent.SeguimientoActualizado -> handleSeguimientoActualizado(event)
                }
            }
        }
    }

    fun loadChat() {
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update {
                    it.copy(
                        isLoading = true,
                        errorMessage = null,
                        sendErrorMessage = null,
                    )
                }
                inboxRepository.marcarLeido(numero, conexionWhatsappId)
                when (val result = inboxRepository.fetchChat(numero, conexionWhatsappId)) {
                    is InboxResult.Success -> applyChatData(result.data, loading = false)
                    InboxResult.Unauthorized -> {
                        _uiState.update { it.copy(isLoading = false) }
                        onUnauthorized()
                    }
                    is InboxResult.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = result.message,
                            )
                        }
                    }
                }
            }
        }
    }

    fun retry() {
        loadChat()
        loadEtiquetasAsignadas()
    }

    fun loadEtiquetasAsignadas() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEtiquetas = true, etiquetaErrorMessage = null) }
            when (
                val result = inboxRepository.fetchChatEtiquetas(numero, conexionWhatsappId)
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(
                            etiquetasAsignadas = result.data,
                            isLoadingEtiquetas = false,
                        )
                    }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isLoadingEtiquetas = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoadingEtiquetas = false,
                            etiquetaErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun loadEtiquetasDisponibles() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(isLoadingEtiquetasDisponibles = true, etiquetaErrorMessage = null)
            }
            when (val result = etiquetasRepository.fetchEtiquetas(conexionWhatsappId)) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(
                            etiquetasDisponibles = result.data,
                            isLoadingEtiquetasDisponibles = false,
                        )
                    }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isLoadingEtiquetasDisponibles = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoadingEtiquetasDisponibles = false,
                            etiquetaErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun clearEtiquetaError() {
        _uiState.update { it.copy(etiquetaErrorMessage = null) }
    }

    fun asignarEtiqueta(nombreEtiqueta: String) {
        val trimmed = nombreEtiqueta.trim()
        if (trimmed.isEmpty()) return

        val state = _uiState.value
        val yaAsignada = state.etiquetasAsignadas.any {
            it.nombre?.equals(trimmed, ignoreCase = true) == true
        }
        if (yaAsignada) return

        val color = state.etiquetasDisponibles
            .firstOrNull { it.nombre?.equals(trimmed, ignoreCase = true) == true }
            ?.displayColor()
            ?: "#22c55e"
        val etiquetaOptimista = InboxChatEtiqueta(nombre = trimmed, color = color)
        val etiquetasAnteriores = state.etiquetasAsignadas

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isEtiquetaActionInProgress = true,
                    etiquetaErrorMessage = null,
                    etiquetasAsignadas = listOf(etiquetaOptimista),
                )
            }
            when (
                val result = inboxRepository.asignarEtiqueta(
                    numero = numero,
                    etiqueta = trimmed,
                    conexionWhatsappId = conexionWhatsappId,
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update { it.copy(isEtiquetaActionInProgress = false) }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update {
                        it.copy(
                            isEtiquetaActionInProgress = false,
                            etiquetasAsignadas = etiquetasAnteriores,
                        )
                    }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isEtiquetaActionInProgress = false,
                            etiquetasAsignadas = etiquetasAnteriores,
                            etiquetaErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun quitarEtiqueta() {
        val etiquetasAnteriores = _uiState.value.etiquetasAsignadas
        if (etiquetasAnteriores.isEmpty()) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isEtiquetaActionInProgress = true,
                    etiquetaErrorMessage = null,
                    etiquetasAsignadas = emptyList(),
                )
            }
            when (
                val result = inboxRepository.quitarEtiqueta(numero, conexionWhatsappId)
            ) {
                is InboxResult.Success -> {
                    _uiState.update { it.copy(isEtiquetaActionInProgress = false) }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update {
                        it.copy(
                            isEtiquetaActionInProgress = false,
                            etiquetasAsignadas = etiquetasAnteriores,
                        )
                    }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isEtiquetaActionInProgress = false,
                            etiquetasAsignadas = etiquetasAnteriores,
                            etiquetaErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun apagarFlujo() {
        if (_uiState.value.isFlujoActionInProgress) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(isFlujoActionInProgress = true, flujoErrorMessage = null)
            }
            when (
                val result = inboxRepository.setBotPause(
                    numero = numero,
                    conexionWhatsappId = conexionWhatsappId,
                    action = "pause",
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(
                            botPausado = result.data.bot_pausado == true,
                            isFlujoActionInProgress = false,
                        )
                    }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isFlujoActionInProgress = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isFlujoActionInProgress = false,
                            flujoErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun encenderFlujo() {
        if (_uiState.value.isFlujoActionInProgress) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(isFlujoActionInProgress = true, flujoErrorMessage = null)
            }
            when (
                val result = inboxRepository.setBotPause(
                    numero = numero,
                    conexionWhatsappId = conexionWhatsappId,
                    action = "resume",
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(
                            botPausado = result.data.bot_pausado == true,
                            isFlujoActionInProgress = false,
                        )
                    }
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isFlujoActionInProgress = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isFlujoActionInProgress = false,
                            flujoErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun sendMessage(texto: String) {
        val trimmed = texto.trim()
        val state = _uiState.value
        val hasAttachment = state.selectedImage != null ||
            state.selectedDocument != null ||
            state.selectedVideo != null ||
            state.selectedAudio != null ||
            state.selectedVoiceNote != null
        if (trimmed.isEmpty() && !hasAttachment) return

        viewModelScope.launch {
            loadMutex.withLock {
                val current = _uiState.value
                if (current.isSending || current.bloqueado || !current.ventana24hAbierta) {
                    return@withLock
                }

                _uiState.update {
                    it.copy(
                        isSending = true,
                        sendErrorMessage = null,
                    )
                }

                try {
                    when (
                        val sendResult = inboxRepository.sendMessage(
                            numero = current.numero,
                            conexionWhatsappId = current.conexionWhatsappId,
                            texto = trimmed,
                            imageUri = current.selectedImage?.uri,
                            documentUri = current.selectedDocument?.uri,
                            videoUri = current.selectedVideo?.uri,
                            audioUri = current.selectedAudio?.uri,
                            voiceNoteUri = current.selectedVoiceNote?.uri,
                        )
                    ) {
                        is InboxResult.Success -> {
                            awaitingSendConfirmation = true
                            pendingSendText = trimmed.ifEmpty { null }
                            _uiState.update {
                                it.copy(
                                    selectedImage = null,
                                    selectedDocument = null,
                                    selectedVideo = null,
                                    selectedAudio = null,
                                    selectedVoiceNote = null,
                                )
                            }
                            scheduleSendFallback()
                        }
                        InboxResult.Unauthorized -> {
                            clearSendPending()
                            onUnauthorized()
                        }
                        is InboxResult.Error -> {
                            clearSendPending()
                            _uiState.update {
                                it.copy(sendErrorMessage = sendResult.message)
                            }
                        }
                    }
                } finally {
                    _uiState.update { it.copy(isSending = false) }
                }
            }
        }
    }

    fun onImageSelected(uri: Uri) {
        if (!_uiState.value.ventana24hAbierta) return
        when (val result = inboxRepository.validateImageSelection(uri)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(
                        selectedImage = PendingImageSelection(
                            uri = uri,
                            displayName = result.data.displayName,
                        ),
                        selectedDocument = null,
                        selectedVideo = null,
                        selectedAudio = null,
                        selectedVoiceNote = null,
                        sendErrorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { it.copy(sendErrorMessage = result.message) }
            }
        }
    }

    fun onDocumentSelected(uri: Uri) {
        if (!_uiState.value.ventana24hAbierta) return
        when (val result = inboxRepository.validateDocumentSelection(uri)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(
                        selectedDocument = PendingDocumentSelection(
                            uri = uri,
                            displayName = result.data.displayName,
                            mimeType = result.data.mimeType,
                            sizeBytes = result.data.sizeBytes,
                        ),
                        selectedImage = null,
                        selectedVideo = null,
                        selectedAudio = null,
                        selectedVoiceNote = null,
                        sendErrorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { it.copy(sendErrorMessage = result.message) }
            }
        }
    }

    fun onVideoSelected(uri: Uri) {
        if (!_uiState.value.ventana24hAbierta) return
        when (val result = inboxRepository.validateVideoSelection(uri)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(
                        selectedVideo = PendingVideoSelection(
                            uri = uri,
                            displayName = result.data.displayName,
                            mimeType = result.data.mimeType,
                            sizeBytes = result.data.sizeBytes,
                        ),
                        selectedImage = null,
                        selectedDocument = null,
                        selectedAudio = null,
                        selectedVoiceNote = null,
                        sendErrorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { it.copy(sendErrorMessage = result.message) }
            }
        }
    }

    fun onAudioSelected(uri: Uri) {
        if (!_uiState.value.ventana24hAbierta) return
        when (val result = inboxRepository.validateAudioSelection(uri)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(
                        selectedAudio = PendingAudioSelection(
                            uri = uri,
                            displayName = result.data.displayName,
                            mimeType = result.data.mimeType,
                            sizeBytes = result.data.sizeBytes,
                        ),
                        selectedImage = null,
                        selectedDocument = null,
                        selectedVideo = null,
                        selectedVoiceNote = null,
                        sendErrorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { it.copy(sendErrorMessage = result.message) }
            }
        }
    }

    fun clearSelectedImage() {
        _uiState.update { it.copy(selectedImage = null) }
    }

    fun clearSelectedDocument() {
        _uiState.update { it.copy(selectedDocument = null) }
    }

    fun clearSelectedVideo() {
        _uiState.update { it.copy(selectedVideo = null) }
    }

    fun clearSelectedAudio() {
        _uiState.update { it.copy(selectedAudio = null) }
    }

    fun clearSelectedVoiceNote() {
        _uiState.update { it.copy(selectedVoiceNote = null) }
    }

    fun startVoiceRecording(): Boolean {
        if (
            _uiState.value.isRecording ||
            _uiState.value.isSending ||
            _uiState.value.bloqueado ||
            !_uiState.value.ventana24hAbierta
        ) {
            return false
        }
        clearPendingAttachments()
        val result = voiceRecorder.start()
        if (result.isFailure) {
            _uiState.update {
                it.copy(sendErrorMessage = "No se pudo iniciar la grabación de voz.")
            }
            return false
        }
        recordingStartedAtMs = System.currentTimeMillis()
        _uiState.update {
            it.copy(
                isRecording = true,
                recordingDurationMs = 0L,
                recordingWillCancel = false,
                sendErrorMessage = null,
            )
        }
        startRecordingTicker()
        return true
    }

    fun setRecordingWillCancel(willCancel: Boolean) {
        if (_uiState.value.isRecording) {
            _uiState.update { it.copy(recordingWillCancel = willCancel) }
        }
    }

    fun cancelVoiceRecording() {
        recordingTickerJob?.cancel()
        voiceRecorder.cancel()
        _uiState.update {
            it.copy(
                isRecording = false,
                recordingDurationMs = 0L,
                recordingWillCancel = false,
            )
        }
    }

    fun finishVoiceRecording() {
        if (!_uiState.value.isRecording) return
        recordingTickerJob?.cancel()

        if (_uiState.value.recordingWillCancel) {
            cancelVoiceRecording()
            return
        }

        val recording = voiceRecorder.stop()
        _uiState.update {
            it.copy(
                isRecording = false,
                recordingDurationMs = 0L,
                recordingWillCancel = false,
            )
        }

        if (recording == null) {
            _uiState.update {
                it.copy(sendErrorMessage = "No se pudo guardar la nota de voz.")
            }
            return
        }

        val uri = recording.file.toUri()
        when (val result = inboxRepository.validateVoiceNoteFile(uri, recording.durationMs)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(
                        selectedVoiceNote = PendingVoiceNoteSelection(
                            uri = uri,
                            durationMs = result.data.durationMs,
                            sizeBytes = result.data.sizeBytes,
                        ),
                        sendErrorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                recording.file.delete()
                _uiState.update { it.copy(sendErrorMessage = result.message) }
            }
        }
    }

    private fun startRecordingTicker() {
        recordingTickerJob?.cancel()
        recordingTickerJob = viewModelScope.launch {
            while (_uiState.value.isRecording) {
                val elapsed = (System.currentTimeMillis() - recordingStartedAtMs).coerceAtLeast(0L)
                _uiState.update { it.copy(recordingDurationMs = elapsed) }
                delay(200L)
            }
        }
    }

    private fun clearPendingAttachments() {
        _uiState.update {
            it.copy(
                selectedImage = null,
                selectedDocument = null,
                selectedVideo = null,
                selectedAudio = null,
                selectedVoiceNote = null,
            )
        }
    }

    private fun scheduleSendFallback() {
        sendFallbackJob?.cancel()
        sendFallbackJob = viewModelScope.launch {
            delay(SEND_CONFIRM_TIMEOUT_MS)
            if (!awaitingSendConfirmation) return@launch
            loadMutex.withLock {
                if (!awaitingSendConfirmation) return@withLock
                reloadChatAfterSendFallback()
            }
        }
    }

    private suspend fun reloadChatAfterSendFallback() {
        when (val result = inboxRepository.fetchChat(numero, conexionWhatsappId)) {
            is InboxResult.Success -> {
                clearSendPending()
                applyChatData(result.data, loading = false)
            }
            InboxResult.Unauthorized -> {
                clearSendPending()
                _uiState.update { it.copy(isSending = false) }
                onUnauthorized()
            }
            is InboxResult.Error -> {
                clearSendPending()
                _uiState.update {
                    it.copy(
                        isSending = false,
                        sendErrorMessage = result.message,
                    )
                }
            }
        }
    }

    private fun handleNuevoMensaje(message: ChatMessage) {
        if (!ChatKey.matchesChat(numero, conexionWhatsappId, message)) return

        val confirmSend = message.isSaliente() && awaitingSendConfirmation
        if (confirmSend) {
            clearSendPending()
        }

        _uiState.update { state ->
            if (isDuplicateMessage(state.mensajes, message)) {
                return@update if (confirmSend) state.copy(isSending = false) else state
            }
            val nuevosMensajes = state.mensajes + message
            state.copy(
                mensajes = nuevosMensajes,
                isSending = if (confirmSend) false else state.isSending,
                sendErrorMessage = null,
            )
        }
        refreshVentana24h(_uiState.value.mensajes)
    }

    private fun handleMensajeEstado(event: SocketEvent.MensajeEstado) {
        _uiState.update { state ->
            state.copy(
                mensajes = state.mensajes.map { message ->
                    if (message.whatsapp_message_id == event.whatsappMessageId) {
                        message.copy(estado_envio = event.estadoEnvio)
                    } else {
                        message
                    }
                },
            )
        }
    }

    private fun handleSeguimientoActualizado(event: SocketEvent.SeguimientoActualizado) {
        if (event.chatKey != chatKey) return

        val pasoIndex = event.payload.paso_index ?: 0
        val estado = event.payload.estado ?: "actualizado"
        val systemMessage = ChatMessage(
            id = "seg-${System.currentTimeMillis()}",
            cliente_numero = numero,
            conexion_whatsapp_id = conexionWhatsappId,
            direccion = "sistema",
            tipo = "texto",
            contenido = "⏱ Seguimiento paso ${pasoIndex + 1}: $estado",
            creado_en = java.time.Instant.now().toString(),
        )

        _uiState.update { state ->
            if (isDuplicateMessage(state.mensajes, systemMessage)) return@update state
            state.copy(mensajes = state.mensajes + systemMessage)
        }
    }

    private fun applyChatData(
        chat: com.macbot.app.data.api.model.ChatData,
        loading: Boolean,
    ) {
        _uiState.update {
            it.copy(
                isLoading = loading,
                nombre = chat.nombre,
                numero = chat.numero,
                conexionWhatsappId = chat.conexionWhatsappId,
                bloqueado = chat.bloqueado,
                mensajes = chat.mensajes,
                botPausado = chat.botPausado,
                errorMessage = null,
            )
        }
        refreshVentana24h(chat.mensajes)
    }

    private fun refreshVentana24h(
        mensajes: List<ChatMessage>,
        ahoraMs: Long = System.currentTimeMillis(),
    ) {
        val ventana = calcularVentana24h(mensajes, ahoraMs)
        _uiState.update { state ->
            if (!ventana.abierta) {
                state.copy(
                    ventana24hAbierta = false,
                    selectedImage = null,
                    selectedDocument = null,
                    selectedVideo = null,
                    selectedAudio = null,
                    selectedVoiceNote = null,
                    isRecording = false,
                    recordingDurationMs = 0L,
                    recordingWillCancel = false,
                )
            } else {
                state.copy(ventana24hAbierta = true)
            }
        }
        if (ventana.abierta) {
            ensureVentanaTickerRunning()
        } else {
            ventanaTickerJob?.cancel()
        }
    }

    /** Actualiza el estado cada 60s mientras la ventana esté abierta (igual que el CRM web). */
    private fun ensureVentanaTickerRunning() {
        if (ventanaTickerJob?.isActive == true) return

        ventanaTickerJob = viewModelScope.launch {
            while (true) {
                delay(VENTANA_TICK_MS)
                val mensajes = _uiState.value.mensajes
                val ventana = calcularVentana24h(mensajes)
                if (ventana.abierta) {
                    _uiState.update { it.copy(ventana24hAbierta = true) }
                } else {
                    refreshVentana24h(mensajes)
                    break
                }
            }
        }
    }

    fun clearFlujoError() {
        _uiState.update { it.copy(flujoErrorMessage = null) }
    }

    fun clearDeleteError() {
        _uiState.update { it.copy(deleteErrorMessage = null) }
    }

    fun clearBlockError() {
        _uiState.update { it.copy(blockErrorMessage = null) }
    }

    fun bloquearContacto(onSuccess: (String) -> Unit) {
        if (_uiState.value.isBlockActionInProgress) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(isBlockActionInProgress = true, blockErrorMessage = null)
            }
            when (val result = inboxRepository.bloquearContacto(numero)) {
                is InboxResult.Success -> {
                    applyBloqueoState(
                        bloqueado = result.data,
                        systemMessage = "🚫 Chat bloqueado",
                    )
                    _uiState.update { it.copy(isBlockActionInProgress = false) }
                    onSuccess("Contacto bloqueado")
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isBlockActionInProgress = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isBlockActionInProgress = false,
                            blockErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    fun desbloquearContacto(onSuccess: (String) -> Unit) {
        if (_uiState.value.isBlockActionInProgress) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(isBlockActionInProgress = true, blockErrorMessage = null)
            }
            when (val result = inboxRepository.desbloquearContacto(numero)) {
                is InboxResult.Success -> {
                    applyBloqueoState(
                        bloqueado = result.data,
                        systemMessage = "✅ Chat desbloqueado",
                    )
                    _uiState.update { it.copy(isBlockActionInProgress = false) }
                    onSuccess("Contacto desbloqueado")
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isBlockActionInProgress = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isBlockActionInProgress = false,
                            blockErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    private fun applyBloqueoState(bloqueado: Boolean, systemMessage: String) {
        appendSystemMessage(systemMessage)
        _uiState.update { it.copy(bloqueado = bloqueado) }
    }

    private fun appendSystemMessage(text: String) {
        val systemMessage = ChatMessage(
            id = "bloqueo-${System.currentTimeMillis()}",
            cliente_numero = numero,
            conexion_whatsapp_id = conexionWhatsappId,
            direccion = "sistema",
            tipo = "texto",
            contenido = text,
            creado_en = java.time.Instant.now().toString(),
        )
        _uiState.update { state ->
            if (isDuplicateMessage(state.mensajes, systemMessage)) return@update state
            state.copy(mensajes = state.mensajes + systemMessage)
        }
    }

    fun eliminarChat(onSuccess: () -> Unit) {
        if (_uiState.value.isDeletingChat) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(isDeletingChat = true, deleteErrorMessage = null)
            }
            when (
                val result = inboxRepository.eliminarChat(
                    numero = numero,
                    conexionWhatsappId = conexionWhatsappId,
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update { it.copy(isDeletingChat = false) }
                    onSuccess()
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isDeletingChat = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isDeletingChat = false,
                            deleteErrorMessage = result.message,
                        )
                    }
                }
            }
        }
    }

    private fun clearSendPending() {
        awaitingSendConfirmation = false
        pendingSendText = null
        sendFallbackJob?.cancel()
        sendFallbackJob = null
    }

    private fun isDuplicateMessage(
        existing: List<ChatMessage>,
        incoming: ChatMessage,
    ): Boolean {
        val incomingId = incoming.id?.trim().orEmpty()
        if (incomingId.isNotEmpty()) {
            return existing.any { it.id?.trim() == incomingId }
        }
        return existing.any { current ->
            current.direccion == incoming.direccion &&
                current.contenido == incoming.contenido &&
                current.creado_en == incoming.creado_en
        }
    }

    class Factory(
        private val inboxRepository: InboxRepository,
        private val etiquetasRepository: EtiquetasRepository,
        private val socketManager: MacBotSocketManager,
        private val openChatTracker: OpenChatTracker,
        private val appContext: Context,
        private val numero: String,
        private val conexionWhatsappId: String,
        private val nombre: String,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ChatViewModel(
                inboxRepository = inboxRepository,
                etiquetasRepository = etiquetasRepository,
                socketManager = socketManager,
                openChatTracker = openChatTracker,
                voiceRecorder = VoiceRecorder(appContext.applicationContext),
                numero = numero,
                conexionWhatsappId = conexionWhatsappId,
                nombreInicial = nombre,
                onUnauthorized = onUnauthorized,
            ) as T
        }
    }

    companion object {
        private const val SEND_CONFIRM_TIMEOUT_MS = 5_000L
        private const val VENTANA_TICK_MS = 60_000L
    }
}
