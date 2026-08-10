package com.kubuno.maps.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** The bottom card for an opened GPX trace: name, stats and elevation profile. */
@Composable
fun TrackCard(track: ActiveTrack, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val data = track.track
    val elevation = data.points.mapNotNull { p -> p.ele?.let { ElevationPoint(p.dist, it) } }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 12.dp,
    ) {
        Column(Modifier.padding(start = 20.dp, end = 12.dp, top = 10.dp, bottom = 16.dp)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Surface(
                    color = MaterialTheme.colorScheme.outlineVariant,
                    shape = RoundedCornerShape(2.dp),
                    modifier = Modifier.padding(bottom = 8.dp),
                ) { Box(Modifier.size(width = 32.dp, height = 4.dp)) }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = track.name,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onClose) {
                    Icon(Icons.Outlined.Close, contentDescription = "Fermer")
                }
            }
            Row(
                Modifier.padding(top = 2.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Stat("Distance", formatKm(data.distanceMeters))
                Stat("Dénivelé +", "${data.elevationGain.roundToInt()} m")
                data.durationSecs?.takeIf { it > 0 }?.let { Stat("Durée", formatDuration(it)) }
            }
            if (elevation.size >= 2) {
                ElevationChart(
                    points = elevation,
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                )
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column {
        Text(value, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun formatKm(meters: Double): String =
    if (meters >= 1000) "%.1f km".format(meters / 1000) else "${meters.roundToInt()} m"

private fun formatDuration(seconds: Long): String {
    val mins = (seconds / 60)
    return if (mins >= 60) "${mins / 60} h ${mins % 60} min" else "$mins min"
}
