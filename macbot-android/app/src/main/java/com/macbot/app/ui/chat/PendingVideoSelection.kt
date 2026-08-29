package com.macbot.app.ui.chat

import android.net.Uri

data class PendingVideoSelection(
    val uri: Uri,
    val displayName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)
