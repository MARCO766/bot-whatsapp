package com.macbot.app.data.session

import android.content.Context
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * CookieJar persistente para conservar connect.sid entre reinicios de la app.
 */
class PersistentCookieJar(context: Context) : CookieJar {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val editor = prefs.edit()
        cookies.forEach { cookie ->
            editor.putString(cookieKey(url, cookie.name), encodeCookie(cookie))
        }
        editor.apply()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val all = prefs.all
        val cookies = mutableListOf<Cookie>()
        all.forEach { (key, value) ->
            if (!key.startsWith(KEY_PREFIX)) return@forEach
            val encoded = value as? String ?: return@forEach
            val cookie = decodeCookie(encoded) ?: return@forEach
            if (cookie.matches(url)) {
                cookies.add(cookie)
            }
        }
        return cookies
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun hasSessionCookie(): Boolean {
        return prefs.all.keys.any { it.contains("connect.sid") }
    }

    fun cookieHeaderFor(url: okhttp3.HttpUrl): String? {
        val cookies = loadForRequest(url)
        if (cookies.isEmpty()) return null
        return cookies.joinToString("; ") { "${it.name}=${it.value}" }.takeIf { it.isNotBlank() }
    }

    private fun cookieKey(url: HttpUrl, name: String): String {
        return "$KEY_PREFIX${url.host}_$name"
    }

    private fun encodeCookie(cookie: Cookie): String {
        return listOf(
            cookie.name,
            cookie.value,
            cookie.domain,
            cookie.path,
            cookie.expiresAt.toString(),
            cookie.secure.toString(),
            cookie.httpOnly.toString(),
            cookie.hostOnly.toString(),
            cookie.persistent.toString(),
        ).joinToString("|")
    }

    private fun decodeCookie(encoded: String): Cookie? {
        val parts = encoded.split("|")
        if (parts.size < 9) return null
        return try {
            Cookie.Builder()
                .name(parts[0])
                .value(parts[1])
                .domain(parts[2])
                .path(parts[3])
                .expiresAt(parts[4].toLong())
                .apply {
                    if (parts[5].toBoolean()) secure()
                    if (parts[6].toBoolean()) httpOnly()
                    if (parts[7].toBoolean()) hostOnlyDomain(parts[2])
                }
                .build()
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val PREFS_NAME = "macbot_cookies"
        private const val KEY_PREFIX = "cookie_"
    }
}
