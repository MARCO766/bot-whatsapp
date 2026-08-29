package com.macbot.app.util

import com.macbot.app.data.api.model.ChatMessage

enum class MediaKind {
    IMAGE,
    VIDEO,
    AUDIO,
    DOCUMENT,
}

private val PLACEHOLDER_TEXT = setOf(
    "audio",
    "video",
    "image",
    "imagen",
    "document",
    "documento",
    "archivo",
    "file",
)

private val IMAGE_EXT = Regex("""\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)""", RegexOption.IGNORE_CASE)
private val VIDEO_EXT = Regex("""\.(mp4|mov|m4v|qt|3gp)(\?|$)""", RegexOption.IGNORE_CASE)
private val WEBM_EXT = Regex("""\.webm(\?|$)""", RegexOption.IGNORE_CASE)
private val AUDIO_EXT = Regex("""\.(ogg|oga|opus|mp3|mpeg|m4a|aac|wav)(\?|$)""", RegexOption.IGNORE_CASE)
private val DOC_EXT = Regex("""\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)(\?|$)""", RegexOption.IGNORE_CASE)

fun mediaUrl(message: ChatMessage): String {
    return sequenceOf(
        message.imagen_url,
        message.media_url,
    )
        .mapNotNull { it?.trim()?.takeIf { url -> url.isNotEmpty() } }
        .firstOrNull()
        .orEmpty()
}

fun isPlaceholderContent(text: String?): Boolean {
    return PLACEHOLDER_TEXT.contains(text?.trim()?.lowercase().orEmpty())
}

fun resolveMediaKind(message: ChatMessage): MediaKind? {
    val mime = pickMime(message)
    var tipo = pickType(message)
    val url = mediaUrl(message)
    val ext = extensionFrom(url).ifBlank { extensionFrom(message.contenido) }
    val hint = contentTypeHint(message)

    if (hint != null && tipo.isEmpty()) tipo = hint
    if (hint != null && (tipo == "document" || tipo == "file")) tipo = hint

    if (url.isEmpty() && mime.isEmpty() && tipo.isEmpty() && hint == null) {
        return null
    }

    if (mimeImpliesAudio(mime)) return MediaKind.AUDIO
    if (mimeImpliesVideo(mime)) return MediaKind.VIDEO
    if (mimeImpliesImage(mime)) return MediaKind.IMAGE

    if (typeImpliesAudio(tipo) && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.AUDIO
    if (typeImpliesVideo(tipo) && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.VIDEO
    if (typeImpliesImage(tipo) && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.IMAGE

    if (url.isNotEmpty()) {
        if (urlImpliesAudio(url)) return MediaKind.AUDIO
        if (urlImpliesVideo(url, tipo, mime)) return MediaKind.VIDEO
        if (IMAGE_EXT.containsMatchIn(url)) return MediaKind.IMAGE
    }

    if (ext.isNotEmpty()) {
        val dotExt = ".$ext"
        if (AUDIO_EXT.containsMatchIn(dotExt) || (ext == "webm" && typeImpliesAudio(tipo))) {
            return MediaKind.AUDIO
        }
        if (VIDEO_EXT.containsMatchIn(dotExt) || (ext == "webm" && !typeImpliesAudio(tipo))) {
            return MediaKind.VIDEO
        }
        if (IMAGE_EXT.containsMatchIn(dotExt)) return MediaKind.IMAGE
        if (DOC_EXT.containsMatchIn(dotExt)) return MediaKind.DOCUMENT
    }

    if (tipo == "document" || tipo == "file") {
        if (mimeImpliesAudio(mime) || urlImpliesAudio(url) || hint == "audio") return MediaKind.AUDIO
        if (mimeImpliesVideo(mime) || urlImpliesVideo(url, tipo, mime) || hint == "video") {
            return MediaKind.VIDEO
        }
        if (mimeImpliesImage(mime) || (url.isNotEmpty() && IMAGE_EXT.containsMatchIn(url)) || hint == "image") {
            return MediaKind.IMAGE
        }
        if (
            (url.isNotEmpty() && DOC_EXT.containsMatchIn(url)) ||
            (ext.isNotEmpty() && DOC_EXT.containsMatchIn(".$ext")) ||
            mimeImpliesDocument(mime)
        ) {
            return MediaKind.DOCUMENT
        }
        return null
    }

    if (hint == "audio" && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.AUDIO
    if (hint == "video" && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.VIDEO
    if (hint == "image" && (url.isNotEmpty() || mime.isNotEmpty())) return MediaKind.IMAGE

    if (mimeImpliesDocument(mime) && url.isNotEmpty() && DOC_EXT.containsMatchIn(url)) {
        return MediaKind.DOCUMENT
    }

    return null
}

fun visibleCaption(message: ChatMessage, kind: MediaKind?): String? {
    val text = message.contenido?.trim().orEmpty()
    if (text.isEmpty() || text.startsWith("http") || isPlaceholderContent(text)) return null
    if (kind == MediaKind.DOCUMENT) {
        val docName = docDisplayName(message)
        if (text == docName) return null
    }
    return text
}

private fun pickMime(message: ChatMessage): String {
    return message.mime_type?.trim()?.lowercase().orEmpty()
}

private fun pickType(message: ChatMessage): String {
    return message.tipo?.trim()?.lowercase().orEmpty()
}

private fun extensionFrom(src: String?): String {
    if (src.isNullOrBlank()) return ""
    val clean = src.substringBefore("?")
    val parts = clean.split(".")
    if (parts.size < 2) return ""
    return parts.last().lowercase()
}

private fun contentTypeHint(message: ChatMessage): String? {
    return when (message.contenido?.trim()?.lowercase().orEmpty()) {
        "audio" -> "audio"
        "video" -> "video"
        "image", "imagen" -> "image"
        else -> null
    }
}

private fun mimeImpliesAudio(mime: String): Boolean {
    if (mime.isEmpty()) return false
    return mime.startsWith("audio/") ||
        Regex("""^audio/(ogg|mpeg|mp3|webm|aac|mp4|x-m4a|wav|opus|x-wav)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(mime)
}

private fun mimeImpliesVideo(mime: String): Boolean {
    if (mime.isEmpty()) return false
    return mime.startsWith("video/") ||
        Regex("""^video/(mp4|webm|quicktime|x-msvideo|mpeg|3gpp)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(mime)
}

private fun mimeImpliesImage(mime: String): Boolean {
    return mime.isNotEmpty() && mime.startsWith("image/")
}

private fun mimeImpliesDocument(mime: String): Boolean {
    if (mime.isEmpty()) return false
    if (
        mime == "application/pdf" ||
        mime.contains("word") ||
        mime.contains("excel") ||
        mime.contains("spreadsheet") ||
        mime.contains("msword") ||
        mime.contains("officedocument")
    ) {
        return true
    }
    return !mime.startsWith("audio/") &&
        !mime.startsWith("video/") &&
        !mime.startsWith("image/")
}

private fun urlImpliesAudio(url: String): Boolean {
    return AUDIO_EXT.containsMatchIn(url) ||
        (WEBM_EXT.containsMatchIn(url) && url.contains("audio", ignoreCase = true))
}

private fun urlImpliesVideo(url: String, tipo: String, mime: String): Boolean {
    if (VIDEO_EXT.containsMatchIn(url)) return true
    if (WEBM_EXT.containsMatchIn(url)) {
        if (mimeImpliesAudio(mime) || typeImpliesAudio(tipo)) return false
        return true
    }
    return false
}

private fun typeImpliesAudio(tipo: String): Boolean {
    return tipo == "audio" || tipo == "voice" || tipo == "ptt"
}

private fun typeImpliesVideo(tipo: String): Boolean = tipo == "video"

private fun typeImpliesImage(tipo: String): Boolean {
    return tipo == "image" || tipo == "imagen" || tipo == "sticker"
}

fun docDisplayName(message: ChatMessage): String {
    val contenido = message.contenido?.trim().orEmpty()
    if (contenido.isNotEmpty() && !contenido.startsWith("http") && !isPlaceholderContent(contenido)) {
        return if (contenido.length > 48) "${contenido.take(45)}…" else contenido
    }
    return runCatching {
        val part = mediaUrl(message).substringAfterLast("/").ifBlank { "Documento" }
        java.net.URLDecoder.decode(part.substringBefore("?"), Charsets.UTF_8.name())
            .ifBlank { "Documento" }
    }.getOrDefault("Documento")
}

fun docExtensionLabel(name: String, mimeType: String? = null): String {
    val ext = name.substringAfterLast('.', "").uppercase()
    if (ext.isNotBlank() && ext.length <= 5) return ext
    return when (mimeType?.lowercase().orEmpty()) {
        "application/pdf" -> "PDF"
        "application/msword" -> "DOC"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> "DOCX"
        "application/vnd.ms-excel" -> "XLS"
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "XLSX"
        else -> "DOC"
    }
}

fun formatFileSize(bytes: Long): String {
    if (bytes < 1024L) return "$bytes B"
    if (bytes < 1024L * 1024L) return "${bytes / 1024L} KB"
    return String.format("%.1f MB", bytes / (1024.0 * 1024.0))
}

fun formatDurationMs(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val min = totalSec / 60L
    val sec = totalSec % 60L
    return "%d:%02d".format(min, sec)
}
