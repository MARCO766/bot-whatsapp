package com.macbot.app.data.api

import com.macbot.app.data.api.model.LoginRequest
import com.macbot.app.data.api.model.LoginResponse
import com.macbot.app.data.api.model.LogoutResponse
import com.macbot.app.data.api.model.MeResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {
    @POST("/api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @GET("/api/auth/me")
    suspend fun me(): Response<MeResponse>

    @POST("/api/auth/logout")
    suspend fun logout(): Response<LogoutResponse>
}
