package com.macbot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.macbot.app.ui.navigation.MacBotApp
import com.macbot.app.ui.theme.MacBotTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val appContainer = (application as MacBotApplication).appContainer
        setContent {
            MacBotTheme {
                MacBotApp(appContainer = appContainer)
            }
        }
    }
}
