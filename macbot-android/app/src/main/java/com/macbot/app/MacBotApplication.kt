package com.macbot.app

import android.app.Application
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
        appContainer = AppContainer(
            sessionManager = sessionManager,
            cookieJar = cookieJar,
        )
    }
}
