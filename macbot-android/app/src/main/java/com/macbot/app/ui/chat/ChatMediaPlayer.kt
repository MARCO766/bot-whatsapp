package com.macbot.app.ui.chat

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

class ChatMediaPlayer(
    context: Context,
) {
    private val appContext = context.applicationContext
    private var exoPlayer: ExoPlayer? = null

    var activeUrl by mutableStateOf<String?>(null)
        private set
    var isPlaying by mutableStateOf(false)
        private set
    var positionMs by mutableLongStateOf(0L)
        private set
    var durationMs by mutableLongStateOf(0L)
        private set

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(playing: Boolean) {
            isPlaying = playing
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) {
                isPlaying = false
                positionMs = 0L
                exoPlayer?.seekTo(0)
            }
            durationMs = exoPlayer?.duration?.coerceAtLeast(0L) ?: 0L
        }
    }

    private fun ensurePlayer(): ExoPlayer {
        val existing = exoPlayer
        if (existing != null) return existing
        return ExoPlayer.Builder(appContext).build().also { player ->
            player.addListener(listener)
            exoPlayer = player
        }
    }

    fun togglePlay(url: String) {
        val player = ensurePlayer()
        if (activeUrl != url) {
            player.stop()
            player.setMediaItem(MediaItem.fromUri(url))
            player.prepare()
            activeUrl = url
        }
        if (player.isPlaying) {
            player.pause()
        } else {
            player.play()
        }
        syncState(player)
    }

    fun pause() {
        exoPlayer?.pause()
        syncState(exoPlayer)
    }

    fun seekTo(position: Long) {
        exoPlayer?.seekTo(position.coerceAtLeast(0L))
        syncState(exoPlayer)
    }

    fun refreshPosition() {
        syncState(exoPlayer)
    }

    fun release() {
        exoPlayer?.removeListener(listener)
        exoPlayer?.release()
        exoPlayer = null
        activeUrl = null
        isPlaying = false
        positionMs = 0L
        durationMs = 0L
    }

    private fun syncState(player: ExoPlayer?) {
        if (player == null) {
            isPlaying = false
            positionMs = 0L
            durationMs = 0L
            return
        }
        isPlaying = player.isPlaying
        positionMs = player.currentPosition.coerceAtLeast(0L)
        durationMs = player.duration.coerceAtLeast(0L)
    }
}
