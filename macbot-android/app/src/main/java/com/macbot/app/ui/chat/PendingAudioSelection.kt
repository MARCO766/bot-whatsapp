package com.macbot.app.ui.chat

import android.net.Uri

data class PendingAudioSelection(
    val uri: Uri,
    val displayName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)
