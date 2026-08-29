package com.macbot.app.di

import android.content.Context
import com.macbot.app.BuildConfig
import com.macbot.app.data.api.AuthApi
import com.macbot.app.data.api.EtiquetasApi
import com.macbot.app.data.api.InboxApi
import com.macbot.app.data.api.MetricasApi
import com.macbot.app.data.realtime.MacBotSocketManager
import com.macbot.app.data.realtime.OpenChatTracker
import com.macbot.app.data.repository.AuthRepository
import com.macbot.app.data.repository.EtiquetasRepository
import com.macbot.app.data.repository.InboxRepository
import com.macbot.app.data.repository.MetricasRepository
import com.macbot.app.data.preferences.ThemePreferences
import com.macbot.app.data.session.PersistentCookieJar
import com.macbot.app.data.session.SessionManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class AppContainer(
    appContext: Context,
    sessionManager: SessionManager,
    cookieJar: PersistentCookieJar,
    themePreferences: ThemePreferences,
) {
    private val applicationContext = appContext.applicationContext

    val themePreferences: ThemePreferences = themePreferences
  // HEADERS en debug: BODY duplica en memoria uploads de video/audio (hasta 15 MB)
  // y puede interferir con el envío multipart.
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.HEADERS
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
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(ensureTrailingSlash(BuildConfig.API_BASE_URL))
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val authApi: AuthApi = retrofit.create(AuthApi::class.java)
    val inboxApi: InboxApi = retrofit.create(InboxApi::class.java)
    val etiquetasApi: EtiquetasApi = retrofit.create(EtiquetasApi::class.java)
    val metricasApi: MetricasApi = retrofit.create(MetricasApi::class.java)

    val authRepository: AuthRepository = AuthRepository(
        authApi = authApi,
        sessionManager = sessionManager,
        cookieJar = cookieJar,
    )

    val inboxRepository: InboxRepository = InboxRepository(
        inboxApi = inboxApi,
        appContext = applicationContext,
    )

    val etiquetasRepository: EtiquetasRepository = EtiquetasRepository(
        etiquetasApi = etiquetasApi,
    )

    val metricasRepository: MetricasRepository = MetricasRepository(
        metricasApi = metricasApi,
    )

    val openChatTracker: OpenChatTracker = OpenChatTracker()

    val socketManager: MacBotSocketManager = MacBotSocketManager(
        cookieJar = cookieJar,
    )

    private fun ensureTrailingSlash(url: String): String {
        return if (url.endsWith("/")) url else "$url/"
    }
}
