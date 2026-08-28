package com.macbot.app.data.repository

import com.macbot.app.data.api.AuthApi
import com.macbot.app.data.api.model.LoginRequest
import com.macbot.app.data.api.model.Usuario
import com.macbot.app.data.session.PersistentCookieJar
import com.macbot.app.data.session.SessionManager

sealed class AuthResult {
    data class Success(val usuario: Usuario) : AuthResult()
    data class Error(val message: String) : AuthResult()
    data object Unauthorized : AuthResult()
}

class AuthRepository(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
    private val cookieJar: PersistentCookieJar,
) {

    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val response = authApi.login(LoginRequest(email.trim(), password))
            when {
                response.isSuccessful -> {
                    val body = response.body()
                    val usuario = body?.usuario
                    if (body?.ok == true && usuario != null) {
                        sessionManager.saveUsuario(usuario)
                        AuthResult.Success(usuario)
                    } else {
                        AuthResult.Error(body?.error ?: "Error iniciando sesión")
                    }
                }
                response.code() == 401 -> AuthResult.Error("Correo o contraseña incorrectos")
                else -> AuthResult.Error("Error del servidor (${response.code()})")
            }
        } catch (e: Exception) {
            AuthResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun checkSession(): AuthResult {
        return try {
            val response = authApi.me()
            when {
                response.isSuccessful -> {
                    val body = response.body()
                    val usuario = body?.usuario
                    if (body?.ok == true && usuario != null) {
                        sessionManager.saveUsuario(usuario)
                        AuthResult.Success(usuario)
                    } else {
                        clearLocalSession()
                        AuthResult.Unauthorized
                    }
                }
                response.code() == 401 -> {
                    clearLocalSession()
                    AuthResult.Unauthorized
                }
                else -> {
                    clearLocalSession()
                    AuthResult.Error("Error validando sesión (${response.code()})")
                }
            }
        } catch (e: Exception) {
            AuthResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun logout(): AuthResult {
        return try {
            authApi.logout()
            clearLocalSession()
            AuthResult.Success(Usuario(id = ""))
        } catch (e: Exception) {
            clearLocalSession()
            AuthResult.Success(Usuario(id = ""))
        }
    }

    suspend fun clearSessionLocally() {
        clearLocalSession()
    }

    private suspend fun clearLocalSession() {
        cookieJar.clear()
        sessionManager.clear()
    }
}
