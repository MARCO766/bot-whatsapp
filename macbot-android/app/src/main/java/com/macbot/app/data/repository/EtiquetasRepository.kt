package com.macbot.app.data.repository

import com.macbot.app.data.api.EtiquetasApi
import com.macbot.app.data.api.model.CreateEtiquetaRequest
import com.macbot.app.data.api.model.EtiquetaItem
import com.macbot.app.data.api.model.UpdateEtiquetaRequest

class EtiquetasRepository(
    private val etiquetasApi: EtiquetasApi,
) {
    suspend fun fetchEtiquetas(conexionWhatsappId: String): InboxResult<List<EtiquetaItem>> {
        return try {
            val response = etiquetasApi.listEtiquetas(conexionWhatsappId)
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body?.ok == true) {
                        InboxResult.Success(body.etiquetas.orEmpty())
                    } else {
                        InboxResult.Error(body?.error ?: "Error cargando etiquetas")
                    }
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun createEtiqueta(
        nombre: String,
        color: String,
        conexionWhatsappId: String,
    ): InboxResult<EtiquetaItem> {
        return try {
            val response = etiquetasApi.createEtiqueta(
                CreateEtiquetaRequest(
                    nombre = nombre,
                    color = color,
                    conexion_whatsapp_id = conexionWhatsappId,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body?.ok == true && body.etiqueta != null) {
                        InboxResult.Success(body.etiqueta)
                    } else {
                        InboxResult.Error(body?.error ?: "No se pudo crear la etiqueta")
                    }
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun updateEtiqueta(
        id: String,
        nombre: String?,
        color: String?,
        conexionWhatsappId: String,
    ): InboxResult<EtiquetaItem> {
        return try {
            val response = etiquetasApi.updateEtiqueta(
                id = id,
                conexionWhatsappId = conexionWhatsappId,
                body = UpdateEtiquetaRequest(
                    nombre = nombre?.trim()?.takeIf { it.isNotEmpty() },
                    color = color?.trim()?.takeIf { it.isNotEmpty() },
                    conexion_whatsapp_id = conexionWhatsappId,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body?.ok == true && body.etiqueta != null) {
                        InboxResult.Success(body.etiqueta)
                    } else {
                        InboxResult.Error(body?.error ?: "No se pudo actualizar la etiqueta")
                    }
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun deleteEtiqueta(
        id: String,
        conexionWhatsappId: String,
    ): InboxResult<Unit> {
        return try {
            val response = etiquetasApi.deleteEtiqueta(
                id = id,
                conexionWhatsappId = conexionWhatsappId,
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> InboxResult.Error(
                    response.body()?.error ?: "No se pudo eliminar la etiqueta",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }
}
