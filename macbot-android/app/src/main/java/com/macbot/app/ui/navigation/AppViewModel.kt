package com.macbot.app.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.Usuario
import com.macbot.app.data.realtime.MacBotSocketManager
import com.macbot.app.data.realtime.OpenChatTracker
import com.macbot.app.data.repository.AuthRepository
import com.macbot.app.data.repository.AuthResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AppUiState {
    data object Loading : AppUiState
    data object Login : AppUiState
    data class Home(val usuario: Usuario) : AppUiState
}

class AppViewModel(
    private val authRepository: AuthRepository,
    private val socketManager: MacBotSocketManager,
    private val openChatTracker: OpenChatTracker,
) : ViewModel() {

    private val _uiState = MutableStateFlow<AppUiState>(AppUiState.Loading)
    val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()

    init {
        checkSession()
    }

    fun checkSession() {
        viewModelScope.launch {
            _uiState.value = AppUiState.Loading
            when (val result = authRepository.checkSession()) {
                is AuthResult.Success -> {
                    if (result.usuario.id.isNotBlank()) {
                        socketManager.connect(result.usuario.id)
                        _uiState.value = AppUiState.Home(result.usuario)
                    } else {
                        _uiState.value = AppUiState.Login
                    }
                }
                AuthResult.Unauthorized -> _uiState.value = AppUiState.Login
                is AuthResult.Error -> _uiState.value = AppUiState.Login
            }
        }
    }

    fun onLoginSuccess(usuario: Usuario) {
        socketManager.connect(usuario.id)
        _uiState.value = AppUiState.Home(usuario)
    }

    fun onLogout() {
        socketManager.disconnect()
        openChatTracker.clearOpenChat()
        _uiState.value = AppUiState.Login
    }

    fun onSessionExpired() {
        viewModelScope.launch {
            authRepository.clearSessionLocally()
            socketManager.disconnect()
            openChatTracker.clearOpenChat()
            _uiState.value = AppUiState.Login
        }
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val socketManager: MacBotSocketManager,
        private val openChatTracker: OpenChatTracker,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return AppViewModel(
                authRepository = authRepository,
                socketManager = socketManager,
                openChatTracker = openChatTracker,
            ) as T
        }
    }
}
