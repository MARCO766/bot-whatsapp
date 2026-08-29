package com.macbot.app.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun ChatFlujoSection(
    botPausado: Boolean,
    flujoNombre: String? = null,
    isActionInProgress: Boolean,
    errorMessage: String?,
    onApagar: () -> Unit,
    onEncender: () -> Unit,
) {
    var showPauseConfirm by rememberSaveable { mutableStateOf(false) }
    var showResumeConfirm by rememberSaveable { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (botPausado) "🔴 Flujo apagado" else "🟢 Flujo activo",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                if (!flujoNombre.isNullOrBlank()) {
                    Text(
                        text = "Nombre: $flujoNombre",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (isActionInProgress) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .size(20.dp),
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 2.dp,
                )
            } else if (botPausado) {
                TextButton(onClick = { showResumeConfirm = true }) {
                    Text(text = "Encender", color = MaterialTheme.colorScheme.primary)
                }
            } else {
                TextButton(onClick = { showPauseConfirm = true }) {
                    Text(text = "Apagar", color = MaterialTheme.colorScheme.error)
                }
            }
        }

        if (!errorMessage.isNullOrBlank()) {
            Text(
                text = errorMessage,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    }

    if (showPauseConfirm) {
        AlertDialog(
            onDismissRequest = { showPauseConfirm = false },
            title = { Text("¿Apagar el flujo?") },
            text = {
                Text("El flujo automático dejará de ejecutarse para este cliente.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showPauseConfirm = false
                        onApagar()
                    },
                ) {
                    Text("Apagar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showPauseConfirm = false }) {
                    Text("Cancelar")
                }
            },
        )
    }

    if (showResumeConfirm) {
        AlertDialog(
            onDismissRequest = { showResumeConfirm = false },
            title = { Text("¿Encender el flujo?") },
            text = {
                Text("El flujo automático volverá a ejecutarse para este cliente.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showResumeConfirm = false
                        onEncender()
                    },
                ) {
                    Text("Encender", color = MaterialTheme.colorScheme.primary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResumeConfirm = false }) {
                    Text("Cancelar")
                }
            },
        )
    }
}
