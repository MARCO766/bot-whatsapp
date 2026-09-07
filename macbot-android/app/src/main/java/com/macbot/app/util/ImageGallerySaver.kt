package com.macbot.app.util

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.Locale
import java.util.concurrent.TimeUnit

object ImageGallerySaver {

    sealed class SaveResult {
        data object Success : SaveResult()
        data class Error(val message: String) : SaveResult()
    }

    private const val MACBOT_ALBUM = "MacBot"
    private val relativePicturesDir = "${Environment.DIRECTORY_PICTURES}/$MACBOT_ALBUM"
    private const val MAX_BYTES = 12L * 1024L * 1024L

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }

    fun saveFromUrl(context: Context, imageUrl: String): SaveResult {
        val url = imageUrl.trim()
        if (url.isEmpty()) {
            return SaveResult.Error("No se pudo descargar la imagen.")
        }
        if (!url.startsWith("https://", ignoreCase = true)) {
            return SaveResult.Error("La imagen no se puede descargar de forma segura.")
        }

        val payload = when (val downloaded = downloadBytes(url)) {
            is DownloadOutcome.Error -> return SaveResult.Error(downloaded.message)
            is DownloadOutcome.Success -> downloaded.image
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(context, payload)
            } else {
                saveToPublicPictures(context, payload)
            }
        } catch (_: Exception) {
            SaveResult.Error("No se pudo guardar la imagen.")
        }
    }

    private data class DownloadedImage(
        val bytes: ByteArray,
        val mimeType: String,
        val displayName: String,
    )

    private sealed class DownloadOutcome {
        data class Success(val image: DownloadedImage) : DownloadOutcome()
        data class Error(val message: String) : DownloadOutcome()
    }

    private fun downloadBytes(url: String): DownloadOutcome {
        return try {
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            httpClient.newCall(request).execute().use { response ->
                val finalUrl = response.request.url
                if (finalUrl.scheme != "https") {
                    return DownloadOutcome.Error("La imagen no se puede descargar de forma segura.")
                }
                if (!response.isSuccessful) {
                    return DownloadOutcome.Error("No se pudo descargar la imagen.")
                }
                val body = response.body ?: return DownloadOutcome.Error("No se pudo descargar la imagen.")
                val contentLength = body.contentLength()
                if (contentLength > MAX_BYTES) {
                    return DownloadOutcome.Error("La imagen es demasiado grande para guardarla.")
                }
                val bytes = body.bytes()
                if (bytes.isEmpty()) {
                    return DownloadOutcome.Error("No se pudo descargar la imagen.")
                }
                if (bytes.size > MAX_BYTES) {
                    return DownloadOutcome.Error("La imagen es demasiado grande para guardarla.")
                }
                val mimeType = resolveMimeType(
                    headerMime = response.header("Content-Type"),
                    url = finalUrl.toString(),
                )
                DownloadOutcome.Success(
                    DownloadedImage(
                        bytes = bytes,
                        mimeType = mimeType,
                        displayName = "MacBot-${System.currentTimeMillis()}.${extensionForMime(mimeType)}",
                    ),
                )
            }
        } catch (_: IllegalArgumentException) {
            DownloadOutcome.Error("No se pudo descargar la imagen.")
        } catch (_: Exception) {
            DownloadOutcome.Error("No se pudo descargar la imagen.")
        }
    }

    private fun saveWithMediaStore(context: Context, image: DownloadedImage): SaveResult {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, image.displayName)
            put(MediaStore.Images.Media.MIME_TYPE, image.mimeType)
            put(MediaStore.Images.Media.RELATIVE_PATH, relativePicturesDir)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values)
            ?: return SaveResult.Error("No se pudo guardar la imagen.")
        try {
            resolver.openOutputStream(uri)?.use { output ->
                output.write(image.bytes)
                output.flush()
            } ?: run {
                resolver.delete(uri, null, null)
                return SaveResult.Error("No se pudo guardar la imagen.")
            }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return SaveResult.Success
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    private fun saveToPublicPictures(context: Context, image: DownloadedImage): SaveResult {
        val pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        val album = File(pictures, MACBOT_ALBUM)
        if (!album.exists() && !album.mkdirs() && !album.isDirectory) {
            return SaveResult.Error("No se pudo guardar la imagen.")
        }
        val file = File(album, image.displayName)
        file.outputStream().use { output ->
            output.write(image.bytes)
            output.flush()
        }
        MediaScannerConnection.scanFile(
            context,
            arrayOf(file.absolutePath),
            arrayOf(image.mimeType),
            null,
        )
        return SaveResult.Success
    }

    private fun resolveMimeType(headerMime: String?, url: String): String {
        val header = headerMime?.substringBefore(';')?.trim()?.lowercase(Locale.US).orEmpty()
        if (header.startsWith("image/") && header != "image/*") {
            return when (header) {
                "image/jpg" -> "image/jpeg"
                else -> header
            }
        }
        val path = url.substringBefore('?').lowercase(Locale.US)
        return when {
            path.endsWith(".png") -> "image/png"
            path.endsWith(".gif") -> "image/gif"
            path.endsWith(".webp") -> "image/webp"
            path.endsWith(".bmp") -> "image/bmp"
            path.endsWith(".heic") -> "image/heic"
            path.endsWith(".heif") -> "image/heif"
            else -> "image/jpeg"
        }
    }

    private fun extensionForMime(mimeType: String): String {
        return when (mimeType.lowercase(Locale.US)) {
            "image/png" -> "png"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            "image/bmp" -> "bmp"
            "image/heic" -> "heic"
            "image/heif" -> "heif"
            else -> "jpg"
        }
    }
}
