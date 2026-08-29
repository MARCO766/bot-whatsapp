package com.macbot.app.ui.chat

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

data class VoiceRecordingResult(
    val file: File,
    val durationMs: Long,
)

class VoiceRecorder(
    private val context: Context,
) {
    private var mediaRecorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startTimeMs: Long = 0L

    val isRecording: Boolean
        get() = mediaRecorder != null

    fun start(): Result<Unit> {
        if (isRecording) return Result.failure(IllegalStateException("Ya está grabando"))
        val webmResult = startRecording(useWebm = true)
        if (webmResult.isSuccess) return webmResult
        return startRecording(useWebm = false)
    }

    private fun startRecording(useWebm: Boolean): Result<Unit> {
        return try {
            val extension = if (useWebm) "webm" else "m4a"
            // Mismo formato que el CRM web cuando el dispositivo lo soporta: audio/webm.
            val file = File(context.cacheDir, "voice_${System.currentTimeMillis()}.$extension")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            if (useWebm) {
                recorder.setOutputFormat(MediaRecorder.OutputFormat.WEBM)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
                recorder.setAudioSamplingRate(48000)
            } else {
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                recorder.setAudioSamplingRate(44100)
            }
            recorder.setAudioEncodingBitRate(96000)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            mediaRecorder = recorder
            outputFile = file
            startTimeMs = System.currentTimeMillis()
            Result.success(Unit)
        } catch (error: Exception) {
            cleanupRecorder(deleteFile = true)
            Result.failure(error)
        }
    }

    fun stop(): VoiceRecordingResult? {
        val recorder = mediaRecorder ?: return null
        val file = outputFile ?: return null
        val durationMs = (System.currentTimeMillis() - startTimeMs).coerceAtLeast(0L)
        return try {
            recorder.stop()
            recorder.release()
            mediaRecorder = null
            if (!file.exists() || file.length() <= 0L) {
                file.delete()
                outputFile = null
                return null
            }
            val result = VoiceRecordingResult(file = file, durationMs = durationMs)
            outputFile = null
            result
        } catch (_: Exception) {
            cleanupRecorder(deleteFile = true)
            null
        }
    }

    fun cancel() {
        cleanupRecorder(deleteFile = true)
    }

    private fun cleanupRecorder(deleteFile: Boolean) {
        try {
            mediaRecorder?.release()
        } catch (_: Exception) {
        }
        mediaRecorder = null
        if (deleteFile) {
            outputFile?.delete()
        }
        outputFile = null
        startTimeMs = 0L
    }
}
