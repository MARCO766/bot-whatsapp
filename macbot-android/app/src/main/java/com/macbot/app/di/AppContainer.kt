package com.macbot.app.di

import com.macbot.app.BuildConfig
import com.macbot.app.data.api.AuthApi
import com.macbot.app.data.api.InboxApi
import com.macbot.app.data.repository.AuthRepository
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.session.PersistentCookieJar
import com.macbot.app.data.session.SessionManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class AppContainer(
    sessionManager: SessionManager,
    cookieJar: PersistentCookieJar,
) {
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BODY
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .addInterceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath
            val builder = request.newBuilder()
            if (path.startsWith("/api/inbox")) {
                builder.header("X-Inbox-Api", "1")
            }
            chain.proceed(builder.build())
        }
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(ensureTrailingSlash(BuildConfig.API_BASE_URL))
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val authApi: AuthApi = retrofit.create(AuthApi::class.java)
    val inboxApi: InboxApi = retrofit.create(InboxApi::class.java)

    val authRepository: AuthRepository = AuthRepository(
        authApi = authApi,
        sessionManager = sessionManager,
        cookieJar = cookieJar,
    )

    val inboxRepository: InboxRepository = InboxRepository(
        inboxApi = inboxApi,
    )

    private fun ensureTrailingSlash(url: String): String {
        return if (url.endsWith("/")) url else "$url/"
    }
}
