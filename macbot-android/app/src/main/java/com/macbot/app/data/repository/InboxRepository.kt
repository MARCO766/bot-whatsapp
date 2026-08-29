package com.macbot.app.data.repository

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import androidx.core.net.toFile
import com.macbot.app.data.api.InboxApi
import com.macbot.app.data.api.model.AsignarEtiquetaRequest
import com.macbot.app.data.api.model.BloquearContactoRequest
import com.macbot.app.data.api.model.BotPauseRequest
import com.macbot.app.data.api.model.BotPauseResponse
import com.macbot.app.data.api.model.ChatData
import com.macbot.app.data.api.model.ChatMessage
import com.macbot.app.data.api.model.ChatResponse
import com.macbot.app.data.api.model.ConexionWhatsapp
import com.macbot.app.data.api.model.InboxChat
import com.macbot.app.data.api.model.InboxChatEtiqueta
import com.macbot.app.data.api.model.InboxResponse
import com.macbot.app.data.api.model.MarcarLeidoRequest
import com.macbot.app.data.api.model.QuitarEtiquetaRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.source
import java.io.File
import java.io.InputStream

sealed class InboxResult<out T> {
    data class Success<T>(val data: T) : InboxResult<T>()
    data class Error(val message: String) : InboxResult<Nothing>()
    data object Unauthorized : InboxResult<Nothing>()
}

data class InboxPage(
    val chats: List<InboxChat>,
    val hasMore: Boolean,
    val offset: Int,
    val limit: Int,
    val totalNoLeidos: Int,
)

class InboxRepository(
    private val inboxApi: InboxApi,
    private val appContext: Context,
) {
    suspend fun fetchConexiones(): InboxResult<List<ConexionWhatsapp>> {
        return try {
            val response = inboxApi.getConexiones()
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> {
                    val body = response.body()
                    if (body?.ok == true) {
                        InboxResult.Success(body.conexiones.orEmpty())
                    } else {
                        InboxResult.Error(body?.error ?: "Error cargando líneas WhatsApp")
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

    suspend fun fetchInbox(
        limit: Int = PAGE_SIZE,
        offset: Int = 0,
        conexionWhatsappId: String? = null,
        etiqueta: String? = null,
    ): InboxResult<InboxPage> {
        return try {
            val etiquetaParam = etiqueta?.takeIf { it.isNotBlank() }
            val response = inboxApi.getInbox(
                limit = limit,
                offset = offset,
                conexionWhatsappId = conexionWhatsappId,
                etiqueta = etiquetaParam,
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> mapInboxResponse(response.body())
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    private fun mapInboxResponse(body: InboxResponse?): InboxResult<InboxPage> {
        if (body?.ok != true) {
            return InboxResult.Error(body?.error ?: "Error cargando bandeja")
        }
        return InboxResult.Success(
            InboxPage(
                chats = body.chats.orEmpty(),
                hasMore = body.hasMore == true,
                offset = body.offset ?: 0,
                limit = body.limit ?: PAGE_SIZE,
                totalNoLeidos = body.totalNoLeidos ?: 0,
            ),
        )
    }

    suspend fun fetchChatEtiquetas(
        numero: String,
        conexionWhatsappId: String,
    ): InboxResult<List<InboxChatEtiqueta>> {
        var offset = 0
        while (true) {
            when (
                val pageResult = fetchInbox(
                    offset = offset,
                    conexionWhatsappId = conexionWhatsappId,
                )
            ) {
                is InboxResult.Success -> {
                    val page = pageResult.data
                    val chat = page.chats.find { chat ->
                        chat.effectiveNumero() == numero &&
                            chat.effectiveConexionId() == conexionWhatsappId
                    }
                    if (chat != null) {
                        return InboxResult.Success(chat.etiquetas.orEmpty())
                    }
                    if (!page.hasMore) {
                        return InboxResult.Success(emptyList())
                    }
                    offset += page.limit.coerceAtLeast(1)
                }
                InboxResult.Unauthorized -> return InboxResult.Unauthorized
                is InboxResult.Error -> return pageResult
            }
        }
    }

    suspend fun asignarEtiqueta(
        numero: String,
        etiqueta: String,
        conexionWhatsappId: String,
    ): InboxResult<Unit> {
        return try {
            val response = inboxApi.asignarEtiqueta(
                AsignarEtiquetaRequest(
                    numero = numero,
                    etiqueta = etiqueta,
                    conexion_whatsapp_id = conexionWhatsappId,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> InboxResult.Error(
                    response.body()?.error ?: "No se pudo asignar la etiqueta",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun quitarEtiqueta(
        numero: String,
        conexionWhatsappId: String,
    ): InboxResult<Unit> {
        return try {
            val response = inboxApi.quitarEtiqueta(
                QuitarEtiquetaRequest(
                    numero = numero,
                    conexion_whatsapp_id = conexionWhatsappId,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> InboxResult.Error(
                    response.body()?.error ?: "No se pudo quitar la etiqueta",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun setBotPause(
        numero: String,
        conexionWhatsappId: String,
        action: String,
    ): InboxResult<BotPauseResponse> {
        return try {
            val response = inboxApi.setBotPause(
                BotPauseRequest(
                    cliente_numero = numero,
                    conexion_whatsapp_id = conexionWhatsappId,
                    action = action,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> {
                    InboxResult.Success(requireNotNull(response.body()))
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: "No se pudo actualizar el flujo",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun marcarLeido(numero: String, conexionWhatsappId: String): InboxResult<Unit> {
        return try {
            val response = inboxApi.marcarLeido(
                MarcarLeidoRequest(
                    numero = numero,
                    conexion_whatsapp_id = conexionWhatsappId,
                ),
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> InboxResult.Error("No se pudo marcar como leído")
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun eliminarChat(numero: String, conexionWhatsappId: String): InboxResult<Unit> {
        return try {
            val response = inboxApi.eliminarChat(
                numero = numero,
                conexionWhatsappId = conexionWhatsappId,
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> InboxResult.Error(
                    response.body()?.error ?: "No se pudo eliminar el chat",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun bloquearContacto(numero: String): InboxResult<Boolean> {
        return toggleBloqueoContacto(numero, bloquear = true)
    }

    suspend fun desbloquearContacto(numero: String): InboxResult<Boolean> {
        return toggleBloqueoContacto(numero, bloquear = false)
    }

    private suspend fun toggleBloqueoContacto(
        numero: String,
        bloquear: Boolean,
    ): InboxResult<Boolean> {
        return try {
            val request = BloquearContactoRequest(numero = numero)
            val response = if (bloquear) {
                inboxApi.bloquearContacto(request)
            } else {
                inboxApi.desbloquearContacto(request)
            }
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> {
                    InboxResult.Success(response.body()?.bloqueado == true)
                }
                else -> InboxResult.Error(
                    response.body()?.error ?: if (bloquear) {
                        "No se pudo bloquear el contacto"
                    } else {
                        "No se pudo desbloquear el contacto"
                    },
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun fetchChat(numero: String, conexionWhatsappId: String): InboxResult<ChatData> {
        return try {
            val response = inboxApi.getChat(
                numero = numero,
                conexionWhatsappId = conexionWhatsappId,
            )
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful -> mapChatResponse(response.body(), numero, conexionWhatsappId)
                else -> InboxResult.Error(
                    response.body()?.error ?: "Error del servidor (${response.code()})",
                )
            }
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    suspend fun sendMessage(
        numero: String,
        conexionWhatsappId: String,
        texto: String,
        imageUri: Uri? = null,
        documentUri: Uri? = null,
        videoUri: Uri? = null,
        audioUri: Uri? = null,
        voiceNoteUri: Uri? = null,
    ): InboxResult<Unit> {
        return try {
            val trimmedText = texto.trim()
            val hasAttachment = imageUri != null || documentUri != null ||
                videoUri != null || audioUri != null || voiceNoteUri != null
            if (!hasAttachment && trimmedText.isEmpty()) {
                return InboxResult.Error("Mensaje vacío")
            }

            val textPlain = "text/plain".toMediaType()
            val mediaType = when {
                imageUri != null -> "image"
                documentUri != null -> "document"
                videoUri != null -> "video"
                audioUri != null -> "audio"
                voiceNoteUri != null -> "voice"
                else -> null
            }
            val archivoPart = when {
                imageUri != null -> buildImagePart(imageUri)
                documentUri != null -> buildDocumentPart(documentUri)
                videoUri != null -> buildVideoPart(videoUri)
                audioUri != null -> buildAudioPart(audioUri, defaultName = "audio.mp3")
                voiceNoteUri != null -> {
                    val voiceDefault = voiceNoteDefaultFilename(voiceNoteUri)
                    buildAudioPart(voiceNoteUri, defaultName = voiceDefault)
                }
                else -> null
            }
            logMediaSend(mediaType, archivoPart)
            val response = inboxApi.sendMessage(
                numero = numero.toRequestBody(textPlain),
                conexionWhatsappId = conexionWhatsappId.toRequestBody(textPlain),
                respuesta = trimmedText.takeIf { it.isNotEmpty() }?.toRequestBody(textPlain),
                archivo = archivoPart,
            )
            logMediaResponse(mediaType, response.code(), response.message(), response.body()?.error)
            when {
                response.code() == 401 -> InboxResult.Unauthorized
                response.isSuccessful && response.body()?.ok == true -> InboxResult.Success(Unit)
                else -> {
                    val code = response.code()
                    val serverError = response.body()?.error?.takeIf { it.isNotBlank() }
                    val message = when (mediaType) {
                        "video" -> serverError?.let { "$it ($code)" }
                            ?: "Error enviando video ($code)"
                        else -> serverError ?: "Error enviando mensaje ($code)"
                    }
                    InboxResult.Error(message)
                }
            }
        } catch (_: FileTooLargeException) {
            InboxResult.Error("El archivo supera el máximo permitido.")
        } catch (_: Exception) {
            InboxResult.Error("No se pudo conectar al servidor. Revisa tu conexión.")
        }
    }

    fun validateVideoSelection(uri: Uri): InboxResult<VideoSelectionInfo> {
        return try {
            val sizeBytes = resolveUriSizeBytes(uri, MAX_VIDEO_BYTES)
            if (sizeBytes < 0L) {
                return InboxResult.Error("No se pudo leer el video seleccionado.")
            }
            if (sizeBytes > MAX_VIDEO_BYTES) {
                return InboxResult.Error("El video supera el máximo de 15 MB permitido.")
            }
            val mimeType = appContext.contentResolver.getType(uri).orEmpty()
            if (mimeType.isNotEmpty() && !mimeType.startsWith("video/")) {
                return InboxResult.Error("Solo se permiten videos.")
            }
            InboxResult.Success(
                VideoSelectionInfo(
                    displayName = resolveDisplayName(uri),
                    mimeType = mimeType.ifBlank { "video/mp4" },
                    sizeBytes = sizeBytes,
                ),
            )
        } catch (_: Exception) {
            InboxResult.Error("No se pudo leer el video seleccionado.")
        }
    }

    fun validateAudioSelection(uri: Uri): InboxResult<AudioSelectionInfo> {
        return try {
            val sizeBytes = resolveUriSizeBytes(uri, MAX_AUDIO_BYTES)
            if (sizeBytes < 0L) {
                return InboxResult.Error("No se pudo leer el audio seleccionado.")
            }
            if (sizeBytes > MAX_AUDIO_BYTES) {
                return InboxResult.Error("El audio supera el máximo de 15 MB permitido.")
            }
            val displayName = resolveDisplayName(uri)
            val mimeType = resolveAudioMimeType(uri, displayName)
            if (!mimeType.startsWith("audio/")) {
                return InboxResult.Error("Solo se permiten archivos de audio.")
            }
            InboxResult.Success(
                AudioSelectionInfo(
                    displayName = displayName,
                    mimeType = mimeType,
                    sizeBytes = sizeBytes,
                ),
            )
        } catch (_: Exception) {
            InboxResult.Error("No se pudo leer el audio seleccionado.")
        }
    }

    fun validateVoiceNoteFile(uri: Uri, durationMs: Long): InboxResult<VoiceNoteSelectionInfo> {
        return try {
            val sizeBytes = resolveUriSizeBytes(uri, MAX_AUDIO_BYTES)
            if (sizeBytes <= 0L) {
                return InboxResult.Error("La nota de voz está vacía.")
            }
            if (sizeBytes > MAX_AUDIO_BYTES) {
                return InboxResult.Error("La nota de voz supera el máximo de 15 MB permitido.")
            }
            if (durationMs < 500L) {
                return InboxResult.Error("La grabación es demasiado corta.")
            }
            InboxResult.Success(
                VoiceNoteSelectionInfo(
                    durationMs = durationMs,
                    sizeBytes = sizeBytes,
                ),
            )
        } catch (_: Exception) {
            InboxResult.Error("No se pudo leer la nota de voz.")
        }
    }

    fun validateDocumentSelection(uri: Uri): InboxResult<DocumentSelectionInfo> {
        return try {
            val sizeBytes = resolveUriSizeBytes(uri, MAX_ATTACHMENT_BYTES)
            if (sizeBytes < 0L) {
                return InboxResult.Error("No se pudo leer el documento seleccionado.")
            }
            if (sizeBytes > MAX_ATTACHMENT_BYTES) {
                return InboxResult.Error("El documento supera el máximo de 2 MB permitido.")
            }
            val displayName = resolveDisplayName(uri)
            val mimeType = resolveDocumentMimeType(uri, displayName)
            if (!isAllowedDocumentMime(mimeType) && !isAllowedDocumentExtension(displayName)) {
                return InboxResult.Error(
                    "Formato no permitido. Usa PDF, DOC, DOCX, XLS o XLSX.",
                )
            }
            InboxResult.Success(
                DocumentSelectionInfo(
                    displayName = displayName,
                    mimeType = mimeType,
                    sizeBytes = sizeBytes,
                ),
            )
        } catch (_: Exception) {
            InboxResult.Error("No se pudo leer el documento seleccionado.")
        }
    }

    private fun buildVideoPart(uri: Uri): MultipartBody.Part {
        val sizeBytes = resolveUriSizeBytes(uri, MAX_VIDEO_BYTES)
        if (sizeBytes < 0L) throw IllegalArgumentException("No se pudo leer el video")
        if (sizeBytes > MAX_VIDEO_BYTES) throw FileTooLargeException()

        val resolver = appContext.contentResolver
        val mimeType = resolver.getType(uri)?.substringBefore(';')?.trim()
            ?.takeIf { it.startsWith("video/") } ?: "video/mp4"
        val fileName = videoFilename(resolveDisplayName(uri), mimeType)
        val uriReadable = canReadUri(uri)
        logMediaPartDetails("video", fileName, mimeType, sizeBytes, uriReadable)

        return MultipartBody.Part.createFormData(
            "archivo",
            fileName,
            uriToRequestBody(uri, mimeType, sizeBytes),
        )
    }

    private fun buildAudioPart(uri: Uri, defaultName: String): MultipartBody.Part {
        val sizeBytes = resolveUriSizeBytes(uri, MAX_AUDIO_BYTES)
        if (sizeBytes <= 0L) throw IllegalArgumentException("No se pudo leer el audio")
        if (sizeBytes > MAX_AUDIO_BYTES) throw FileTooLargeException()

        val displayName = resolveDisplayName(uri)
        val mimeType = resolveAudioMimeType(uri, displayName)
        val fileName = audioFilename(displayName, mimeType, defaultName)
        val uriReadable = canReadUri(uri)
        val tipo = if (defaultName.endsWith(".webm")) "voice" else "audio"
        logMediaPartDetails(tipo, fileName, mimeType, sizeBytes, uriReadable)

        return MultipartBody.Part.createFormData(
            "archivo",
            fileName,
            uriToRequestBody(uri, mimeType, sizeBytes),
        )
    }

    private fun resolveAudioMimeType(uri: Uri, displayName: String?): String {
        val resolverMime = appContext.contentResolver.getType(uri)
            ?.substringBefore(';')
            ?.trim()
            .orEmpty()
        if (resolverMime.isNotEmpty() && resolverMime != "application/octet-stream") {
            return resolverMime
        }
        val ext = displayName?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return when (ext) {
            "webm" -> "audio/webm"
            "mp3" -> "audio/mpeg"
            "m4a" -> "audio/mp4"
            "ogg" -> "audio/ogg"
            "wav" -> "audio/wav"
            else -> if (displayName.isNullOrBlank() && uri.scheme == "file") {
                when (uri.toFile().extension.lowercase()) {
                    "webm" -> "audio/webm"
                    "m4a" -> "audio/mp4"
                    "mp3" -> "audio/mpeg"
                    else -> "audio/webm"
                }
            } else {
                "audio/mpeg"
            }
        }
    }

    private fun buildDocumentPart(uri: Uri): MultipartBody.Part {
        val sizeBytes = resolveUriSizeBytes(uri, MAX_ATTACHMENT_BYTES)
        if (sizeBytes < 0L) {
            throw IllegalArgumentException("No se pudo leer el documento")
        }
        if (sizeBytes > MAX_ATTACHMENT_BYTES) {
            throw FileTooLargeException()
        }

        val resolver = appContext.contentResolver
        val displayName = resolveDisplayName(uri)
        val mimeType = resolveDocumentMimeType(uri, displayName)
        if (!isAllowedDocumentMime(mimeType) && !isAllowedDocumentExtension(displayName)) {
            throw IllegalArgumentException("Formato de documento no permitido")
        }
        val fileName = displayName ?: "documento.pdf"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalArgumentException("No se pudo leer el documento")
        if (bytes.size > MAX_ATTACHMENT_BYTES) {
            throw FileTooLargeException()
        }

        return MultipartBody.Part.createFormData(
            "archivo",
            fileName,
            bytes.toRequestBody(mimeType.toMediaType()),
        )
    }

    private fun resolveDocumentMimeType(uri: Uri, displayName: String?): String {
        val resolverMime = appContext.contentResolver.getType(uri)?.trim().orEmpty()
        if (resolverMime.isNotEmpty() && resolverMime != "application/octet-stream") {
            return resolverMime
        }
        return mimeFromExtension(displayName) ?: "application/octet-stream"
    }

    private fun mimeFromExtension(fileName: String?): String? {
        val ext = fileName?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return ALLOWED_DOCUMENT_EXTENSIONS[ext]
    }

    private fun isAllowedDocumentMime(mimeType: String): Boolean {
        return ALLOWED_DOCUMENT_MIMES.contains(mimeType.lowercase())
    }

    private fun isAllowedDocumentExtension(fileName: String?): Boolean {
        val ext = fileName?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return ALLOWED_DOCUMENT_EXTENSIONS.containsKey(ext)
    }

    fun validateImageSelection(uri: Uri): InboxResult<ImageSelectionInfo> {
        return try {
            val sizeBytes = resolveUriSizeBytes(uri, MAX_IMAGE_BYTES)
            if (sizeBytes < 0L) {
                return InboxResult.Error("No se pudo leer la imagen seleccionada.")
            }
            if (sizeBytes > MAX_IMAGE_BYTES) {
                return InboxResult.Error("La imagen supera el máximo de 2 MB permitido.")
            }
            val mimeType = appContext.contentResolver.getType(uri).orEmpty()
            if (mimeType.isNotEmpty() && !mimeType.startsWith("image/")) {
                return InboxResult.Error("Solo se permiten imágenes.")
            }
            InboxResult.Success(
                ImageSelectionInfo(
                    displayName = resolveDisplayName(uri),
                    sizeBytes = sizeBytes,
                ),
            )
        } catch (_: Exception) {
            InboxResult.Error("No se pudo leer la imagen seleccionada.")
        }
    }

    private fun buildImagePart(uri: Uri): MultipartBody.Part {
        val sizeBytes = resolveUriSizeBytes(uri, MAX_ATTACHMENT_BYTES)
        if (sizeBytes < 0L) {
            throw IllegalArgumentException("No se pudo leer la imagen")
        }
        if (sizeBytes > MAX_ATTACHMENT_BYTES) {
            throw FileTooLargeException()
        }

        val resolver = appContext.contentResolver
        val mimeType = resolver.getType(uri)?.substringBefore(';')?.trim() ?: "image/jpeg"
        val fileName = resolveDisplayName(uri) ?: "imagen.jpg"
        logMediaPartDetails("image", fileName, mimeType, sizeBytes, canReadUri(uri))

        return MultipartBody.Part.createFormData(
            "archivo",
            fileName,
            uriToRequestBody(uri, mimeType, sizeBytes),
        )
    }

    private fun uriToRequestBody(uri: Uri, mimeType: String, sizeBytes: Long): RequestBody {
        val mediaType = mimeType.toMediaType()
        return object : RequestBody() {
            override fun contentType() = mediaType

            override fun contentLength(): Long = sizeBytes

            override fun writeTo(sink: okio.BufferedSink) {
                openUriInputStream(uri).use { input ->
                    sink.writeAll(input.source())
                }
            }
        }
    }

    private fun openUriInputStream(uri: Uri): InputStream {
        if (uri.scheme == "file") {
            return uri.toFile().inputStream()
        }
        return appContext.contentResolver.openInputStream(uri)
            ?: throw IllegalArgumentException("No se pudo leer el archivo")
    }

    private fun canReadUri(uri: Uri): Boolean {
        return try {
            openUriInputStream(uri).use { it.read() >= 0 }
        } catch (_: Exception) {
            false
        }
    }

    private fun voiceNoteDefaultFilename(uri: Uri): String {
        if (uri.scheme == "file") {
            return when (uri.toFile().extension.lowercase()) {
                "m4a" -> "audio.m4a"
                "mp3" -> "audio.mp3"
                else -> "audio.webm"
            }
        }
        return "audio.webm"
    }

    private fun videoFilename(displayName: String?, mimeType: String): String {
        val base = displayName?.trim().orEmpty()
        if (base.isNotEmpty() && base.contains('.')) return base
        val stem = base.ifEmpty { "video" }
        return when {
            mimeType.contains("3gpp") -> "$stem.3gp"
            mimeType.contains("quicktime") -> "$stem.mov"
            else -> "$stem.mp4"
        }
    }

    private fun audioFilename(displayName: String?, mimeType: String, defaultName: String): String {
        val base = displayName?.trim().orEmpty()
        if (base.isNotEmpty() && base.contains('.')) return base
        if (base.isNotEmpty()) {
            return when {
                mimeType.contains("webm") -> "$base.webm"
                mimeType.contains("mpeg") || mimeType.contains("mp3") -> "$base.mp3"
                mimeType.contains("ogg") -> "$base.ogg"
                mimeType.contains("wav") -> "$base.wav"
                mimeType.contains("mp4") || mimeType.contains("m4a") -> "$base.m4a"
                else -> defaultName
            }
        }
        return defaultName
    }

    private fun logMediaPartDetails(
        tipo: String,
        fileName: String,
        mimeType: String,
        sizeBytes: Long,
        uriReadable: Boolean,
    ) {
        Log.d(
            MEDIA_LOG_TAG,
            "MEDIA SEND: tipo=$tipo filename=$fileName mime=$mimeType size=$sizeBytes uriReadable=$uriReadable",
        )
    }

    private fun logMediaSend(tipo: String?, part: MultipartBody.Part?) {
        if (tipo == null || part == null) return
        Log.d(MEDIA_LOG_TAG, "MEDIA SEND: multipartField=archivo tipo=$tipo")
    }

    private fun logMediaResponse(
        tipo: String?,
        code: Int,
        message: String,
        errorBody: String?,
    ) {
        if (tipo == null) return
        val safeError = errorBody?.takeIf { it.isNotBlank() } ?: "(sin detalle)"
        Log.d(
            MEDIA_LOG_TAG,
            "MEDIA RESPONSE: tipo=$tipo code=$code message=$message error=$safeError",
        )
    }

    private fun resolveUriSizeBytes(uri: Uri, maxBytes: Long = MAX_ATTACHMENT_BYTES): Long {
        if (uri.scheme == "file") {
            val file = uri.toFile()
            if (file.exists()) return file.length()
        }
        appContext.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
            if (descriptor.statSize >= 0L) {
                return descriptor.statSize
            }
        }
        appContext.contentResolver.openInputStream(uri)?.use { stream ->
            var total = 0L
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = stream.read(buffer)
                if (read == -1) break
                total += read
                if (total > maxBytes) return total
            }
            return total
        }
        return -1L
    }

    private fun resolveDisplayName(uri: Uri): String? {
        appContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0 && cursor.moveToFirst()) {
                return cursor.getString(nameIndex)
            }
        }
        return null
    }

    private class FileTooLargeException : Exception()

    private fun mapChatResponse(
        body: ChatResponse?,
        fallbackNumero: String,
        fallbackConexionId: String,
    ): InboxResult<ChatData> {
        if (body?.ok != true) {
            return InboxResult.Error(body?.error ?: "Error cargando chat")
        }
        val mensajes = sortMensajes(body.mensajes.orEmpty())
        val numero = body.numero ?: body.cliente_numero ?: fallbackNumero
        val conexionId = body.conexion_whatsapp_id
            ?: body.conexionWhatsappId
            ?: fallbackConexionId
        val nombre = body.nombre?.trim().takeUnless { it.isNullOrEmpty() } ?: numero
        return InboxResult.Success(
            ChatData(
                numero = numero,
                conexionWhatsappId = conexionId,
                nombre = nombre,
                bloqueado = body.bloqueado == true,
                mensajes = mensajes,
                botPausado = body.bot_pausado == true,
                botPausadoHasta = body.bot_pausado_hasta,
                botPausadoMotivo = body.bot_pausado_motivo,
            ),
        )
    }

    private fun sortMensajes(mensajes: List<ChatMessage>): List<ChatMessage> {
        return mensajes.sortedWith(
            compareBy<ChatMessage> { parseMessageInstant(it.creado_en) }
                .thenBy { it.id.orEmpty() },
        )
    }

    private fun parseMessageInstant(fechaIso: String?): Long {
        if (fechaIso.isNullOrBlank()) return 0L
        return try {
            java.time.Instant.parse(fechaIso).toEpochMilli()
        } catch (_: Exception) {
            try {
                java.time.LocalDateTime.parse(fechaIso.dropLast(1))
                    .atZone(java.time.ZoneOffset.UTC)
                    .toInstant()
                    .toEpochMilli()
            } catch (_: Exception) {
                0L
            }
        }
    }

    companion object {
        private const val MEDIA_LOG_TAG = "MacBotMedia"
        const val PAGE_SIZE = 20
        const val MAX_IMAGE_BYTES = 2L * 1024L * 1024L
        const val MAX_ATTACHMENT_BYTES = MAX_IMAGE_BYTES
        const val MAX_VIDEO_BYTES = 15L * 1024L * 1024L
        const val MAX_AUDIO_BYTES = 15L * 1024L * 1024L

        private val ALLOWED_DOCUMENT_MIMES = setOf(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        private val ALLOWED_DOCUMENT_EXTENSIONS = mapOf(
            "pdf" to "application/pdf",
            "doc" to "application/msword",
            "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" to "application/vnd.ms-excel",
            "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
}

data class ImageSelectionInfo(
    val displayName: String?,
    val sizeBytes: Long,
)

data class DocumentSelectionInfo(
    val displayName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)

data class VideoSelectionInfo(
    val displayName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)

data class AudioSelectionInfo(
    val displayName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)

data class VoiceNoteSelectionInfo(
    val durationMs: Long,
    val sizeBytes: Long,
)
