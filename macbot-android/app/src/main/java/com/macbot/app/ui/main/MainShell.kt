package com.macbot.app.ui.main

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.macbot.app.ui.chat.ChatScreen
import com.macbot.app.ui.etiquetas.EtiquetasScreen
import com.macbot.app.ui.etiquetas.TagChatsScreen
import com.macbot.app.ui.home.HomeScreen
import com.macbot.app.ui.inbox.InboxScreen
import com.macbot.app.ui.metricas.MetricasScreen

private object MainRoutes {
    const val INBOX = "inbox"
    const val ETIQUETAS = "etiquetas"
    const val METRICAS = "metricas"
    const val ACCOUNT = "account"
    const val TAG_CHATS =
        "etiquetas/chats/{etiquetaNombre}/{conexionWhatsappId}?color={color}"
    const val CHAT = "chat/{numero}/{conexionWhatsappId}?nombre={nombre}"
}

private val bottomBarRoutes = setOf(
    MainRoutes.INBOX,
    MainRoutes.ETIQUETAS,
    MainRoutes.METRICAS,
    MainRoutes.ACCOUNT,
)

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
    val showBottomBar = currentRoute in bottomBarRoutes
    var pendingDeletedChat by remember { mutableStateOf<Pair<String, String>?>(null) }
    var inboxSnackbarMessage by remember { mutableStateOf<String?>(null) }

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
                        icon = { Text("📨") },
                        label = { Text("Bandeja") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == MainRoutes.ETIQUETAS,
                        onClick = {
                            navController.navigate(MainRoutes.ETIQUETAS) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Text("🏷️") },
                        label = { Text("Etiquetas") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == MainRoutes.METRICAS,
                        onClick = {
                            navController.navigate(MainRoutes.METRICAS) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Text("📊") },
                        label = { Text("Métricas") },
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
                        icon = { Text("👤") },
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
                        navigateToChat(navController, numero, conexionId, nombre)
                    },
                    pendingDeletedChat = pendingDeletedChat,
                    onPendingDeletedChatHandled = { pendingDeletedChat = null },
                    snackbarMessage = inboxSnackbarMessage,
                    onSnackbarShown = { inboxSnackbarMessage = null },
                )
            }

            composable(MainRoutes.ETIQUETAS) {
                EtiquetasScreen(
                    appContainer = appContainer,
                    onUnauthorized = onSessionExpired,
                    onTagClick = { nombre, color, conexionId ->
                        val encodedNombre = Uri.encode(nombre)
                        val encodedConexion = Uri.encode(conexionId)
                        val encodedColor = Uri.encode(color)
                        navController.navigate(
                            "etiquetas/chats/$encodedNombre/$encodedConexion?color=$encodedColor",
                        )
                    },
                )
            }

            composable(MainRoutes.METRICAS) {
                MetricasScreen(
                    appContainer = appContainer,
                    onUnauthorized = onSessionExpired,
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
                route = MainRoutes.TAG_CHATS,
                arguments = listOf(
                    navArgument("etiquetaNombre") { type = NavType.StringType },
                    navArgument("conexionWhatsappId") { type = NavType.StringType },
                    navArgument("color") {
                        type = NavType.StringType
                        defaultValue = "#22c55e"
                    },
                ),
            ) { backStackEntry ->
                val etiquetaNombre = Uri.decode(
                    backStackEntry.arguments?.getString("etiquetaNombre").orEmpty(),
                )
                val conexionId = Uri.decode(
                    backStackEntry.arguments?.getString("conexionWhatsappId").orEmpty(),
                )
                val color = Uri.decode(backStackEntry.arguments?.getString("color").orEmpty())
                TagChatsScreen(
                    etiquetaNombre = etiquetaNombre,
                    etiquetaColor = color,
                    conexionWhatsappId = conexionId,
                    appContainer = appContainer,
                    onBack = { navController.popBackStack() },
                    onUnauthorized = onSessionExpired,
                    onChatClick = { numero, chatConexionId, nombre ->
                        navigateToChat(navController, numero, chatConexionId, nombre)
                    },
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
                ChatScreen(
                    numero = numero,
                    conexionWhatsappId = conexionId,
                    nombre = nombre,
                    appContainer = appContainer,
                    onBack = { navController.popBackStack() },
                    onUnauthorized = onSessionExpired,
                    onChatDeleted = { deletedNumero, deletedConexionId ->
                        pendingDeletedChat = deletedNumero to deletedConexionId
                        inboxSnackbarMessage = "Chat eliminado"
                        navController.popBackStack()
                    },
                )
            }
        }
    }
}

private fun navigateToChat(
    navController: androidx.navigation.NavHostController,
    numero: String,
    conexionId: String,
    nombre: String,
) {
    val encodedNumero = Uri.encode(numero)
    val encodedConexion = Uri.encode(conexionId)
    val encodedNombre = Uri.encode(nombre)
    navController.navigate(
        "chat/$encodedNumero/$encodedConexion?nombre=$encodedNombre",
    )
}
