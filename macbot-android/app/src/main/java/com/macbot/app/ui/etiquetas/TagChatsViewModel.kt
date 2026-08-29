package com.macbot.app.ui.etiquetas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.InboxChat
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.InboxResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class TagChatsUiState(
    val etiquetaNombre: String = "",
    val etiquetaColor: String = "#22c55e",
    val conexionWhatsappId: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val chats: List<InboxChat> = emptyList(),
    val hasMore: Boolean = false,
    val errorMessage: String? = null,
)

class TagChatsViewModel(
    private val inboxRepository: InboxRepository,
    private val etiquetaNombre: String,
    private val etiquetaColor: String,
    private val conexionWhatsappId: String,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        TagChatsUiState(
            etiquetaNombre = etiquetaNombre,
            etiquetaColor = etiquetaColor,
            conexionWhatsappId = conexionWhatsappId,
        ),
    )
    val uiState: StateFlow<TagChatsUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()

    init {
        loadInitial()
    }

    fun loadInitial() {
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
                loadChatsInternal(reset = true)
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadMutex.withLock {
                if (_uiState.value.isRefreshing || _uiState.value.isLoadingMore) return@withLock
                _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
                loadChatsInternal(reset = true)
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun loadMore() {
        viewModelScope.launch {
            loadMutex.withLock {
                val state = _uiState.value
                if (!state.hasMore || state.isLoadingMore || state.isLoading) return@withLock
                _uiState.update { it.copy(isLoadingMore = true) }
                loadChatsInternal(reset = false)
                _uiState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun retry() = loadInitial()

    private suspend fun loadChatsInternal(reset: Boolean) {
        val state = _uiState.value
        val offset = if (reset) 0 else state.chats.size

        when (
            val result = inboxRepository.fetchInbox(
                limit = InboxRepository.PAGE_SIZE,
                offset = offset,
                conexionWhatsappId = state.conexionWhatsappId,
                etiqueta = state.etiquetaNombre,
            )
        ) {
            is InboxResult.Success -> {
                val page = result.data
                val merged = if (reset) page.chats else state.chats + page.chats
                _uiState.update {
                    it.copy(
                        chats = merged,
                        hasMore = page.hasMore,
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

    class Factory(
        private val inboxRepository: InboxRepository,
        private val etiquetaNombre: String,
        private val etiquetaColor: String,
        private val conexionWhatsappId: String,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return TagChatsViewModel(
                inboxRepository = inboxRepository,
                etiquetaNombre = etiquetaNombre,
                etiquetaColor = etiquetaColor,
                conexionWhatsappId = conexionWhatsappId,
                onUnauthorized = onUnauthorized,
            ) as T
        }
    }
}
