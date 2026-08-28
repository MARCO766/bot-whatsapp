package com.macbot.app.ui.main

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.macbot.app.data.api.model.Usuario
import com.macbot.app.di.AppContainer
import com.macbot.app.ui.chat.ChatPlaceholderScreen
import com.macbot.app.ui.home.HomeScreen
import com.macbot.app.ui.inbox.InboxScreen

private object MainRoutes {
    const val INBOX = "inbox"
    const val ACCOUNT = "account"
    const val CHAT = "chat/{numero}/{conexionWhatsappId}?nombre={nombre}"
}

@Composable
fun MainShell(
    usuario: Usuario,
    appContainer: AppContainer,
    onLogout: () -> Unit,
    onSessionExpired: () -> Unit,
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val showBottomBar = currentRoute == MainRoutes.INBOX || currentRoute == MainRoutes.ACCOUNT

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == MainRoutes.INBOX,
                        onClick = {
                            navController.navigate(MainRoutes.INBOX) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                        label = { Text("Bandeja") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == MainRoutes.ACCOUNT,
                        onClick = {
                            navController.navigate(MainRoutes.ACCOUNT) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Default.Person, contentDescription = null) },
                        label = { Text("Cuenta") },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = MainRoutes.INBOX,
            modifier = Modifier.padding(padding),
        ) {
            composable(MainRoutes.INBOX) {
                InboxScreen(
                    appContainer = appContainer,
                    onUnauthorized = onSessionExpired,
                    onChatClick = { numero, conexionId, nombre ->
                        val encodedNumero = Uri.encode(numero)
                        val encodedConexion = Uri.encode(conexionId)
                        val encodedNombre = Uri.encode(nombre)
                        navController.navigate(
                            "chat/$encodedNumero/$encodedConexion?nombre=$encodedNombre",
                        )
                    },
                )
            }

            composable(MainRoutes.ACCOUNT) {
                HomeScreen(
                    usuario = usuario,
                    appContainer = appContainer,
                    onLogout = onLogout,
                )
            }

            composable(
                route = MainRoutes.CHAT,
                arguments = listOf(
                    navArgument("numero") { type = NavType.StringType },
                    navArgument("conexionWhatsappId") { type = NavType.StringType },
                    navArgument("nombre") {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                ),
            ) { backStackEntry ->
                val numero = Uri.decode(backStackEntry.arguments?.getString("numero").orEmpty())
                val conexionId = Uri.decode(
                    backStackEntry.arguments?.getString("conexionWhatsappId").orEmpty(),
                )
                val nombre = Uri.decode(backStackEntry.arguments?.getString("nombre").orEmpty())
                ChatPlaceholderScreen(
                    numero = numero,
                    conexionWhatsappId = conexionId,
                    nombre = nombre,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
