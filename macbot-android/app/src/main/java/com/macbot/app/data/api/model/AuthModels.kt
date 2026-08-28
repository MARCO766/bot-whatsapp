package com.macbot.app.data.api.model

data class LoginRequest(
    val email: String,
    val password: String,
)

data class LoginResponse(
    val ok: Boolean,
    val usuario: Usuario? = null,
    val error: String? = null,
)

data class MeResponse(
    val ok: Boolean,
    val usuario: Usuario? = null,
    val error: String? = null,
)

data class LogoutResponse(
    val ok: Boolean,
)
