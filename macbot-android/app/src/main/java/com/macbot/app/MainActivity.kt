package com.macbot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.macbot.app.MacBotApplication
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.navigation.MacBotApp
import com.macbot.app.ui.theme.MacBotTheme

class MainActivity : ComponentActivity() {
    private lateinit var appContainer: AppContainer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        appContainer = (application as MacBotApplication).appContainer
        setContent {
            val isDarkTheme by appContainer.themePreferences.isDarkTheme
                .collectAsStateWithLifecycle(initialValue = false)
            MacBotTheme(darkTheme = isDarkTheme) {
                MacBotApp(appContainer = appContainer)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::appContainer.isInitialized) {
            appContainer.socketManager.reconnectIfNeeded()
        }
    }
}
