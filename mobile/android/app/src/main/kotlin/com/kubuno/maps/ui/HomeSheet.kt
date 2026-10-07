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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Work
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kubuno.maps.net.SavedPlace

/** Peek height reserved for the home sheet so map controls can sit above it. */
val HomeSheetPeek = 316.dp

/**
 * The home bottom sheet (Citymapper/Transit-inspired): quick Maison/Travail
 * favourites, a big "Aller quelque part" action, and a live "À proximité" list.
 */
@Composable
fun HomeSheet(
    savedPlaces: List<SavedPlace>,
    onSearch: () -> Unit,
    onFavorite: () -> Unit,
    onSelectPlace: (SavedPlace) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MapsShape.Sheet,
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 16.dp,
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Surface(
                    color = MaterialTheme.colorScheme.outlineVariant,
                    shape = MapsShape.Pill,
                    modifier = Modifier.padding(bottom = 10.dp),
                ) { Box(Modifier.size(width = 36.dp, height = 4.dp)) }
            }

            // Favourites row — Maison / Travail (open search to pick, for now).
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FavoriteChip(Icons.Outlined.Home, "Maison", MapsColors.Cycle, Modifier.weight(1f), onFavorite)
                FavoriteChip(Icons.Outlined.Work, "Travail", MapsColors.Transit, Modifier.weight(1f), onFavorite)
            }

            // Big "go somewhere" action.
            Button(
                onClick = onSearch,
                shape = MapsShape.Button,
                colors = ButtonDefaults.buttonColors(containerColor = MapsColors.BlueVivid),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 54.dp)
                    .padding(top = 12.dp),
            ) {
                Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(22.dp))
                Text("Aller quelque part", style = MapsType.TitlePunch, color = Color.White, modifier = Modifier.padding(start = 10.dp))
            }

            Text(
                "À PROXIMITÉ",
                style = MapsType.Section,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
            )
            if (savedPlaces.isEmpty()) {
                Text(
                    "Vos lieux enregistrés apparaîtront ici.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            } else {
                LazyColumn(Modifier.heightIn(max = 150.dp)) {
                    items(savedPlaces) { place ->
                        NearbyRow(place, onSelectPlace)
                    }
                }
            }
        }
    }
}

@Composable
private fun FavoriteChip(
    icon: ImageVector,
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MapsShape.Pill,
        modifier = modifier.clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ModeIconCircle(icon, color, size = 32)
            Text(
                label,
                style = MapsType.BodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}

@Composable
private fun NearbyRow(place: SavedPlace, onClick: (SavedPlace) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onClick(place) }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ModeIconCircle(Icons.Outlined.Bookmark, MapsColors.Place, size = 36)
        Column(Modifier.padding(start = 14.dp)) {
            Text(
                place.name,
                style = MapsType.BodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            place.address?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
