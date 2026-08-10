package com.kubuno.maps.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Straight
import androidx.compose.material.icons.filled.TurnLeft
import androidx.compose.material.icons.filled.TurnRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** The turn-by-turn HUD: a maneuver banner on top, remaining/quit bar at the bottom. */
@Composable
fun NavOverlay(nav: NavState, onQuit: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        // Maneuver banner (accent), top.
        Surface(
            color = MaterialTheme.colorScheme.primary,
            shadowElevation = 6.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(12.dp)
                .fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
        ) {
            Row(
                Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(
                    maneuverIcon(nav.instruction),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(40.dp),
                )
                Column(Modifier.weight(1f)) {
                    if (!nav.arrived) {
                        Text(
                            formatDistance(nav.distanceToNext),
                            color = Color.White,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        nav.instruction,
                        color = Color.White,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        // Remaining + quit, bottom.
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 12.dp,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
            shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        ) {
            Row(
                Modifier
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    if (nav.arrived) {
                        Text("Arrivé", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    } else {
                        Text(
                            formatDuration(nav.remainingSeconds),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            formatDistance(nav.remainingDistance) + " restants",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Button(
                    onClick = onQuit,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text(if (nav.arrived) "Terminer" else "Quitter") }
            }
        }
    }
}

private fun maneuverIcon(instruction: String): ImageVector {
    val i = instruction.lowercase()
    return when {
        i.contains("arriv") -> Icons.Filled.Flag
        i.contains("gauche") -> Icons.Filled.TurnLeft
        i.contains("droite") -> Icons.Filled.TurnRight
        i.contains("rond-point") || i.contains("demi-tour") -> Icons.AutoMirrored.Filled.DirectionsWalk
        else -> Icons.Filled.Straight
    }
}

private fun formatDuration(seconds: Double): String {
    val mins = (seconds / 60).roundToInt()
    return if (mins >= 60) "${mins / 60} h ${mins % 60} min" else "$mins min"
}

private fun formatDistance(meters: Double): String =
    if (meters >= 1000) "%.1f km".format(meters / 1000) else "${meters.roundToInt()} m"
