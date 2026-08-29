package com.macbot.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.auth.LoginScreen
import com.macbot.app.ui.main.MainShell

@Composable
fun MacBotApp(appContainer: AppContainer) {
    val appViewModel: AppViewModel = viewModel(
        factory = AppViewModel.Factory(
            authRepository = appContainer.authRepository,
            socketManager = appContainer.socketManager,
            openChatTracker = appContainer.openChatTracker,
        ),
    )
    val uiState by appViewModel.uiState.collectAsStateWithLifecycle()

    when (val state = uiState) {
        AppUiState.Loading -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        AppUiState.Login -> {
            LoginScreen(
                appContainer = appContainer,
                onLoginSuccess = appViewModel::onLoginSuccess,
            )
        }

        is AppUiState.Home -> {
            MainShell(
                usuario = state.usuario,
                appContainer = appContainer,
                onLogout = appViewModel::onLogout,
                onSessionExpired = appViewModel::onSessionExpired,
            )
        }
    }
}
