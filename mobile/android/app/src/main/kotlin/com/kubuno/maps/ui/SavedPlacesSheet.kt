package com.kubuno.maps.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Route
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kubuno.maps.net.GpxTrace
import com.kubuno.maps.net.SavedPlace
import kotlin.math.roundToInt

/** The library sheet: saved places and imported GPX traces, in two tabs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibrarySheet(
    places: List<SavedPlace>,
    traces: List<GpxTrace>,
    onSelectPlace: (SavedPlace) -> Unit,
    onSelectTrace: (GpxTrace) -> Unit,
    onDeleteTrace: (GpxTrace) -> Unit,
    onImportGpx: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var tab by remember { mutableIntStateOf(0) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Lieux") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Traces") })
        }
        when (tab) {
            0 -> PlacesTab(places, onSelectPlace)
            else -> TracesTab(traces, onSelectTrace, onDeleteTrace, onImportGpx)
        }
    }
}

@Composable
private fun PlacesTab(places: List<SavedPlace>, onSelect: (SavedPlace) -> Unit) {
    if (places.isEmpty()) {
        Empty("Aucun lieu enregistré pour l'instant.")
        return
    }
    LazyColumn(Modifier.heightIn(max = 420.dp).padding(vertical = 4.dp)) {
        items(places) { place ->
            LibraryRow(
                icon = Icons.Filled.Bookmark,
                title = place.name,
                subtitle = place.address,
                onClick = { onSelect(place) },
            )
        }
    }
}

@Composable
private fun TracesTab(
    traces: List<GpxTrace>,
    onSelect: (GpxTrace) -> Unit,
    onDelete: (GpxTrace) -> Unit,
    onImport: () -> Unit,
) {
    TextButton(onClick = onImport, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        Icon(Icons.Outlined.FileUpload, contentDescription = null, modifier = Modifier.size(18.dp))
        Text("Importer un fichier GPX", modifier = Modifier.padding(start = 8.dp))
    }
    if (traces.isEmpty()) {
        Empty("Aucune trace. Importez un fichier .gpx pour commencer.")
        return
    }
    LazyColumn(Modifier.heightIn(max = 380.dp).padding(bottom = 4.dp)) {
        items(traces) { trace ->
            LibraryRow(
                icon = Icons.Outlined.Route,
                title = trace.name,
                subtitle = traceSubtitle(trace),
                onClick = { onSelect(trace) },
                trailing = {
                    IconButton(onClick = { onDelete(trace) }) {
                        Icon(Icons.Outlined.Delete, contentDescription = "Supprimer")
                    }
                },
            )
        }
    }
}

@Composable
private fun LibraryRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String?,
    onClick: () -> Unit,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing?.invoke()
    }
}

@Composable
private fun Empty(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
    )
}

private fun traceSubtitle(trace: GpxTrace): String {
    val parts = mutableListOf<String>()
    trace.activityType?.takeIf { it.isNotBlank() && it != "other" }?.let { parts.add(it) }
    trace.distanceMeters?.let {
        parts.add(if (it >= 1000) "%.1f km".format(it / 1000) else "${it.roundToInt()} m")
    }
    trace.elevationGain?.takeIf { it > 0 }?.let { parts.add("↑ ${it.roundToInt()} m") }
    return parts.joinToString(" · ")
}
