package com.kubuno.maps.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** The horizontal "explore around" category chips, under the search bar. */
@Composable
fun CategoryChips(
    active: String?,
    onToggle: (PoiCategory) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 12.dp),
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
    ) {
        items(POI_CATEGORIES) { category ->
            FilterChip(
                selected = active == category.id,
                onClick = { onToggle(category) },
                shape = MapsShape.Pill,
                label = { Text("${category.emoji}  ${category.label}", style = MapsType.BodyStrong) },
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    selectedContainerColor = MapsColors.BlueVivid.copy(alpha = 0.16f),
                    selectedLabelColor = MapsColors.BlueDeep,
                ),
                elevation = FilterChipDefaults.filterChipElevation(elevation = 3.dp),
            )
        }
    }
}
