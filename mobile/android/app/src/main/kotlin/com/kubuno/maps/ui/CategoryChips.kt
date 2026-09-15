package com.kubuno.maps.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kubuno.android.ui.components.KubunoChip

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
            KubunoChip(
                label = "${category.emoji}  ${category.label}",
                selected = active == category.id,
                onClick = { onToggle(category) },
            )
        }
    }
}
