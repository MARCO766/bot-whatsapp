package com.macbot.app.data.api.model

data class EtiquetasResponse(
    val ok: Boolean,
    val total: Int? = null,
    val etiquetas: List<EtiquetaItem>? = null,
    val conexion_whatsapp_id: String? = null,
    val error: String? = null,
)

data class EtiquetaItem(
    val id: String? = null,
    val nombre: String? = null,
    val color: String? = null,
    val creado_en: String? = null,
    val conexion_whatsapp_id: String? = null,
    val conexionWhatsappId: String? = null,
    val conexion_nombre: String? = null,
    val leadsCount: Int? = null,
) {
    fun effectiveConexionId(): String = conexion_whatsapp_id ?: conexionWhatsappId ?: ""

    fun displayColor(): String = color?.trim().orEmpty().ifBlank { "#22c55e" }
}

data class CreateEtiquetaRequest(
    val nombre: String,
    val color: String,
    val conexion_whatsapp_id: String,
)

data class UpdateEtiquetaRequest(
    val nombre: String? = null,
    val color: String? = null,
    val conexion_whatsapp_id: String,
)

data class EtiquetaMutationResponse(
    val ok: Boolean,
    val etiqueta: EtiquetaItem? = null,
    val error: String? = null,
)
