package com.macbot.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.macbot.app.data.api.model.Usuario
import com.macbot.app.data.repository.AuthRepository
import com.macbot.app.data.repository.AuthResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun login(onSuccess: (Usuario) -> Unit) {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password

        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Ingresa correo y contraseña") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val result = authRepository.login(email, password)) {
                is AuthResult.Success -> onSuccess(result.usuario)
                is AuthResult.Error -> _uiState.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
                AuthResult.Unauthorized -> _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Correo o contraseña incorrectos",
                    )
                }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    class Factory(
        private val authRepository: AuthRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(authRepository) as T
        }
    }
}
