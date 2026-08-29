package com.macbot.app.ui.etiquetas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.EtiquetaItem
import com.macbot.app.data.repository.EtiquetasRepository
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.InboxResult
import com.macbot.app.ui.inbox.InboxConstants
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class EtiquetasUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isSaving: Boolean = false,
    val etiquetas: List<EtiquetaItem> = emptyList(),
    val conexiones: List<ConexionWhatsapp> = emptyList(),
    val selectedConexionId: String = InboxConstants.CONEXION_TODAS,
    val errorMessage: String? = null,
    val showCreateDialog: Boolean = false,
    val createError: String? = null,
    val editingTag: EtiquetaItem? = null,
    val editError: String? = null,
    val deletingTag: EtiquetaItem? = null,
    val deleteError: String? = null,
)

class EtiquetasViewModel(
    private val etiquetasRepository: EtiquetasRepository,
    private val inboxRepository: InboxRepository,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EtiquetasUiState())
    val uiState: StateFlow<EtiquetasUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()

    val puedeCrear: Boolean
        get() = _uiState.value.selectedConexionId != InboxConstants.CONEXION_TODAS

    init {
        loadInitial()
    }

    fun loadInitial() {
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
                loadConexionesInternal()
                loadEtiquetasInternal()
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadMutex.withLock {
                if (_uiState.value.isRefreshing) return@withLock
                _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
                loadEtiquetasInternal()
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun retry() = loadInitial()

    fun selectConexion(id: String) {
        if (id == _uiState.value.selectedConexionId) return
        _uiState.update { it.copy(selectedConexionId = id) }
        viewModelScope.launch {
            loadMutex.withLock {
                _uiState.update { it.copy(isLoading = true, errorMessage = null) }
                loadEtiquetasInternal()
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun openCreateDialog() {
        if (!puedeCrear) return
        _uiState.update { it.copy(showCreateDialog = true, createError = null) }
    }

    fun closeCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = false, createError = null) }
    }

    fun createEtiqueta(nombre: String, color: String) {
        val trimmed = nombre.trim()
        if (trimmed.isEmpty()) {
            _uiState.update { it.copy(createError = "Nombre obligatorio") }
            return
        }
        val conexionId = _uiState.value.selectedConexionId
        if (conexionId == InboxConstants.CONEXION_TODAS) {
            _uiState.update { it.copy(createError = "Selecciona una línea WhatsApp") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, createError = null) }
            when (
                val result = etiquetasRepository.createEtiqueta(trimmed, color, conexionId)
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            showCreateDialog = false,
                            createError = null,
                        )
                    }
                    refresh()
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isSaving = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(isSaving = false, createError = result.message)
                    }
                }
            }
        }
    }

    fun openEditDialog(tag: EtiquetaItem) {
        val conexionId = tag.effectiveConexionId()
        if (conexionId.isBlank()) return
        _uiState.update { it.copy(editingTag = tag, editError = null) }
    }

    fun closeEditDialog() {
        _uiState.update { it.copy(editingTag = null, editError = null) }
    }

    fun openDeleteDialog(tag: EtiquetaItem) {
        val conexionId = tag.effectiveConexionId()
        if (conexionId.isBlank()) return
        _uiState.update { it.copy(deletingTag = tag, deleteError = null) }
    }

    fun closeDeleteDialog() {
        _uiState.update { it.copy(deletingTag = null, deleteError = null) }
    }

    fun updateEtiqueta(nombre: String, color: String) {
        val tag = _uiState.value.editingTag ?: return
        val id = tag.id.orEmpty()
        val conexionId = tag.effectiveConexionId()
        if (id.isBlank() || conexionId.isBlank()) return

        val trimmed = nombre.trim()
        if (trimmed.isEmpty()) {
            _uiState.update { it.copy(editError = "Nombre obligatorio") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, editError = null) }
            when (
                val result = etiquetasRepository.updateEtiqueta(
                    id = id,
                    nombre = trimmed,
                    color = color,
                    conexionWhatsappId = conexionId,
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(isSaving = false, editingTag = null, editError = null)
                    }
                    refresh()
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isSaving = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(isSaving = false, editError = result.message)
                    }
                }
            }
        }
    }

    fun confirmDeleteEtiqueta() {
        val tag = _uiState.value.deletingTag ?: return
        val id = tag.id.orEmpty()
        val conexionId = tag.effectiveConexionId()
        if (id.isBlank() || conexionId.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, deleteError = null) }
            when (
                val result = etiquetasRepository.deleteEtiqueta(
                    id = id,
                    conexionWhatsappId = conexionId,
                )
            ) {
                is InboxResult.Success -> {
                    _uiState.update {
                        it.copy(isSaving = false, deletingTag = null, deleteError = null)
                    }
                    refresh()
                }
                InboxResult.Unauthorized -> {
                    _uiState.update { it.copy(isSaving = false) }
                    onUnauthorized()
                }
                is InboxResult.Error -> {
                    _uiState.update {
                        it.copy(isSaving = false, deleteError = result.message)
                    }
                }
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
                _uiState.update { it.copy(errorMessage = result.message) }
            }
        }
    }

    private suspend fun loadEtiquetasInternal() {
        val conexionId = _uiState.value.selectedConexionId
        when (val result = etiquetasRepository.fetchEtiquetas(conexionId)) {
            is InboxResult.Success -> {
                _uiState.update {
                    it.copy(etiquetas = result.data, errorMessage = null)
                }
            }
            InboxResult.Unauthorized -> onUnauthorized()
            is InboxResult.Error -> {
                _uiState.update {
                    it.copy(
                        etiquetas = emptyList(),
                        errorMessage = result.message,
                    )
                }
            }
        }
    }

    class Factory(
        private val etiquetasRepository: EtiquetasRepository,
        private val inboxRepository: InboxRepository,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return EtiquetasViewModel(
                etiquetasRepository = etiquetasRepository,
                inboxRepository = inboxRepository,
                onUnauthorized = onUnauthorized,
            ) as T
        }
    }
}
