package com.macbot.app.ui.chat

import android.net.Uri

data class PendingVoiceNoteSelection(
    val uri: Uri,
    val durationMs: Long,
    val sizeBytes: Long,
)
