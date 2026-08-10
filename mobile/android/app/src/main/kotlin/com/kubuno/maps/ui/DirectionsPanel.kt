package com.kubuno.maps.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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

/** The top card of the directions flow: back, origin/destination, swap, modes. */
@Composable
fun DirectionsTopCard(
    state: DirectionsState,
    onClose: () -> Unit,
    onSwap: () -> Unit,
    onMode: (TravelMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primary,
        shadowElevation = 4.dp,
    ) {
        Column(Modifier.padding(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) {
                    Icon(
                        Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = "Fermer l'itinéraire",
                        tint = Color.White,
                    )
                }
                Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
                    EndpointRow(Icons.Filled.Circle, state.originLabel)
                    HorizontalDivider(
                        color = Color.White.copy(alpha = 0.25f),
                        modifier = Modifier.padding(start = 34.dp, top = 6.dp, bottom = 6.dp),
                    )
                    EndpointRow(Icons.Filled.Place, state.destLabel)
                }
                IconButton(onClick = onSwap) {
                    Icon(Icons.Filled.SwapVert, contentDescription = "Inverser", tint = Color.White)
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ModeButton(Icons.Filled.DirectionsCar, TravelMode.DRIVING, state.mode, onMode)
                ModeButton(Icons.AutoMirrored.Filled.DirectionsBike, TravelMode.CYCLING, state.mode, onMode)
                ModeButton(Icons.AutoMirrored.Filled.DirectionsWalk, TravelMode.FOOT, state.mode, onMode)
            }
        }
    }
}

@Composable
private fun EndpointRow(icon: ImageVector, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            icon,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(18.dp).padding(start = 8.dp),
        )
        Text(
            text = label.ifBlank { "—" },
            color = Color.White,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
private fun ModeButton(
    icon: ImageVector,
    mode: TravelMode,
    current: TravelMode,
    onMode: (TravelMode) -> Unit,
) {
    val active = mode == current
    Surface(
        color = if (active) Color.White else Color.White.copy(alpha = 0.12f),
        contentColor = if (active) MaterialTheme.colorScheme.primary else Color.White,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.selectable(selected = active) { onMode(mode) },
    ) {
        Box(Modifier.padding(horizontal = 22.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = mode.api)
        }
    }
}

/** The bottom sheet of the directions flow: alternatives + the steps list. */
@Composable
fun DirectionsSheet(
    state: DirectionsState,
    onSelectRoute: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 12.dp,
    ) {
        Column(Modifier.padding(top = 8.dp, bottom = 8.dp)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Surface(
                    color = MaterialTheme.colorScheme.outlineVariant,
                    shape = RoundedCornerShape(2.dp),
                    modifier = Modifier.padding(bottom = 8.dp),
                ) { Box(Modifier.size(width = 32.dp, height = 4.dp)) }
            }

            when {
                state.loading -> Box(
                    Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }

                state.needsLocation -> Message("Activez la localisation pour calculer l'itinéraire.")

                state.routes.isEmpty() -> Message("Aucun itinéraire trouvé.")

                else -> {
                    // Route alternatives as selectable summary rows.
                    state.routes.forEachIndexed { index, route ->
                        RouteSummaryRow(
                            route = route,
                            selected = index == state.selected,
                            onClick = { onSelectRoute(index) },
                        )
                        HorizontalDivider()
                    }
                    // Turn-by-turn for the selected route.
                    val steps = state.routes.getOrNull(state.selected)?.steps.orEmpty()
                    LazyColumn(Modifier.heightIn(max = 220.dp)) {
                        items(steps) { step ->
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Text(
                                    text = step.instruction,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = formatDistance(step.distanceMeters),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteSummaryRow(route: RouteOption, selected: Boolean, onClick: () -> Unit) {
    Surface(
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, onClick = onClick),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = formatDuration(route.durationSeconds),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = formatDistance(route.distanceMeters),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun Message(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
    )
}

private fun formatDuration(seconds: Double): String {
    val mins = (seconds / 60).roundToInt()
    return if (mins >= 60) "${mins / 60} h ${mins % 60} min" else "$mins min"
}

private fun formatDistance(meters: Double): String =
    if (meters >= 1000) "%.1f km".format(meters / 1000) else "${meters.roundToInt()} m"
