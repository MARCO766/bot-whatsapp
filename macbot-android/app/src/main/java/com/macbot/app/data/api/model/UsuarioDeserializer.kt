package com.macbot.app.data.api.model

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.annotations.JsonAdapter
import java.lang.reflect.Type

@JsonAdapter(UsuarioDeserializer::class)
data class Usuario(
    val id: String,
    val nombre: String? = null,
    val email: String? = null,
)

class UsuarioDeserializer : JsonDeserializer<Usuario> {
    override fun deserialize(
        json: JsonElement,
        typeOfT: Type,
        context: JsonDeserializationContext,
    ): Usuario {
        val obj = json.asJsonObject
        val idElement = obj.get("id")
        val id = when {
            idElement == null || idElement.isJsonNull -> ""
            idElement.isJsonPrimitive && idElement.asJsonPrimitive.isNumber ->
                idElement.asJsonPrimitive.asNumber.toString()
            else -> idElement.asString
        }
        val nombre = obj.get("nombre")?.takeIf { !it.isJsonNull }?.asString
        val email = obj.get("email")?.takeIf { !it.isJsonNull }?.asString
        return Usuario(id = id, nombre = nombre, email = email)
    }
}
