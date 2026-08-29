package com.macbot.app.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.InboxChat
import com.macbot.app.data.realtime.ChatKey
import com.macbot.app.data.realtime.MacBotSocketManager
import com.macbot.app.data.realtime.OpenChatTracker
import com.macbot.app.data.realtime.SocketEvent
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.InboxResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class InboxUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val chats: List<InboxChat> = emptyList(),
    val conexiones: List<ConexionWhatsapp> = emptyList(),
    val selectedConexionId: String = InboxConstants.CONEXION_TODAS,
    val hasMore: Boolean = false,
    val totalNoLeidos: Int = 0,
    val errorMessage: String? = null,
)

class InboxViewModel(
    private val inboxRepository: InboxRepository,
    private val socketManager: MacBotSocketManager,
    private val openChatTracker: OpenChatTracker,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InboxUiState())
    val uiState: StateFlow<InboxUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()

    init {
        loadInitial()
        observeSocketEvents()
    }

    private fun observeSocketEvents() {
        viewModelScope.launch {
            socketManager.events.collect { event ->
                if (event is SocketEvent.NuevoMensaje) {
                    handleNuevoMensaje(event.message, event.chatKey)
                }
            }
        }
    }

    fun loadInitial() {
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
                loadConexionesInternal()
                loadInboxInternal(reset = true)
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadMutex.withLock {
                if (_uiState.value.isRefreshing || _uiState.value.isLoadingMore) return@withLock
                _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
                loadInboxInternal(reset = true)
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun loadMore() {
        viewModelScope.launch {
            loadMutex.withLock {
                val state = _uiState.value
                if (
                    !state.hasMore ||
                    state.isLoadingMore ||
                    state.isLoading ||
                    state.isRefreshing
                ) {
                    return@withLock
                }
                _uiState.update { it.copy(isLoadingMore = true, errorMessage = null) }
                loadInboxInternal(reset = false)
                _uiState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun retry() {
        loadInitial()
    }

    fun onChatDeleted(numero: String, conexionWhatsappId: String) {
        _uiState.update { state ->
            val filtered = state.chats.filter { chat ->
                chat.effectiveNumero() != numero ||
                    chat.effectiveConexionId() != conexionWhatsappId
            }
            state.copy(chats = filtered)
        }
        refresh()
    }

    fun selectConexion(conexionId: String) {
        if (_uiState.value.selectedConexionId == conexionId) return
        _uiState.update { it.copy(selectedConexionId = conexionId) }
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
                loadInboxInternal(reset = true)
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun handleNuevoMensaje(message: ChatMessage, chatKey: String) {
        if (chatKey.isBlank()) return

        val conexionId = message.conexion_whatsapp_id?.trim().orEmpty()
        if (!matchesConexionFilter(conexionId, _uiState.value.selectedConexionId)) return

        val preview = messagePreview(message)
        val timestamp = message.creado_en?.takeIf { it.isNotBlank() }
        val isOpenChat = openChatTracker.isOpenChat(chatKey)

        var shouldRefreshFirstPage = false

        _uiState.update { state ->
            val index = state.chats.indexOfFirst { existing ->
                ChatKey.fromInboxChat(existing) == chatKey
            }

            if (index < 0) {
                shouldRefreshFirstPage = true
                return@update state
            }

            val chat = state.chats[index]
            val updatedChat = chat.copy(
                ultimoMensaje = preview,
                ultimoMensajeEn = timestamp ?: chat.ultimoMensajeEn,
                noLeidos = if (isOpenChat) 0 else (chat.noLeidos ?: 0) + 1,
            )
            val reordered = listOf(updatedChat) + state.chats.filterIndexed { i, _ -> i != index }
            val totalDelta = if (isOpenChat) 0 else 1

            state.copy(
                chats = reordered,
                totalNoLeidos = (state.totalNoLeidos + totalDelta).coerceAtLeast(0),
            )
        }

        if (shouldRefreshFirstPage) {
            refreshFirstPageConservative()
        }
    }

    private fun refreshFirstPageConservative() {
        viewModelScope.launch {
            loadMutex.withLock {
                val state = _uiState.value
                if (state.isLoading || state.isRefreshing || state.isLoadingMore) return@withLock
                loadInboxInternal(reset = true)
            }
        }
    }

    private fun messagePreview(message: ChatMessage): String {
        val contenido = message.contenido?.trim().orEmpty()
        if (contenido.isNotEmpty()) return contenido
        return message.tipo?.trim().orEmpty().ifBlank { "Mensaje" }
    }

    private fun matchesConexionFilter(conexionWhatsappId: String, selectedId: String): Boolean {
        if (selectedId == InboxConstants.CONEXION_TODAS) return true
        if (conexionWhatsappId.isBlank()) return false
        return conexionWhatsappId.equals(selectedId, ignoreCase = true)
    }

    private suspend fun loadConexionesInternal() {
        when (val result = inboxRepository.fetchConexiones()) {
            is InboxResult.Success -> {
                _uiState.update { it.copy(conexiones = result.data) }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update { it.copy(errorMessage = result.message) }
            }
        }
    }

    private suspend fun loadInboxInternal(reset: Boolean) {
        val state = _uiState.value
        val offset = if (reset) 0 else state.chats.size
        val conexionParam = apiConexionParam(state.selectedConexionId)

        when (
            val result = inboxRepository.fetchInbox(
                limit = InboxRepository.PAGE_SIZE,
                offset = offset,
                conexionWhatsappId = conexionParam,
            )
        ) {
            is InboxResult.Success -> {
                val page = result.data
                val merged = if (reset) page.chats else state.chats + page.chats
                _uiState.update {
                    it.copy(
                        chats = merged,
                        hasMore = page.hasMore,
                        totalNoLeidos = page.totalNoLeidos,
                        errorMessage = null,
                    )
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update {
                    it.copy(
                        errorMessage = result.message,
                        chats = if (reset) emptyList() else it.chats,
                    )
                }
            }
        }
    }

    private fun apiConexionParam(selectedId: String): String? {
        return if (selectedId == InboxConstants.CONEXION_TODAS) null else selectedId
    }

    class Factory(
        private val inboxRepository: InboxRepository,
        private val socketManager: MacBotSocketManager,
        private val openChatTracker: OpenChatTracker,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return InboxViewModel(
                inboxRepository = inboxRepository,
                socketManager = socketManager,
                openChatTracker = openChatTracker,
                onUnauthorized = onUnauthorized,
            ) as T
        }
    }
}
