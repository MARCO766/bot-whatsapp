package com.macbot.app

import android.app.Application
import com.macbot.app.data.preferences.ThemePreferences
import com.macbot.app.data.session.PersistentCookieJar
import com.macbot.app.data.session.SessionManager
import com.macbot.app.di.AppContainer

class MacBotApplication : Application() {

    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        val sessionManager = SessionManager(this)
        val cookieJar = PersistentCookieJar(this)
        val themePreferences = ThemePreferences(this)
        appContainer = AppContainer(
            appContext = this,
            sessionManager = sessionManager,
            cookieJar = cookieJar,
            themePreferences = themePreferences,
        )
    }
}
