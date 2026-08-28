package com.macbot.app.data.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.macbot.app.data.api.model.Usuario
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "macbot_session"
)

class SessionManager(private val context: Context) {

    private val dataStore = context.sessionDataStore

    val usuarioFlow: Flow<Usuario?> = dataStore.data.map { prefs ->
        val id = prefs[KEY_USER_ID] ?: return@map null
        Usuario(
            id = id,
            nombre = prefs[KEY_NOMBRE],
            email = prefs[KEY_EMAIL],
        )
    }

    suspend fun getUsuario(): Usuario? = usuarioFlow.first()

    suspend fun saveUsuario(usuario: Usuario) {
        dataStore.edit { prefs ->
            prefs[KEY_USER_ID] = usuario.id
            usuario.nombre?.let { prefs[KEY_NOMBRE] = it }
            usuario.email?.let { prefs[KEY_EMAIL] = it }
        }
    }

    suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    companion object {
        private val KEY_USER_ID = stringPreferencesKey("user_id")
        private val KEY_NOMBRE = stringPreferencesKey("nombre")
        private val KEY_EMAIL = stringPreferencesKey("email")
    }
}
