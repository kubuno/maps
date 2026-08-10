package com.kubuno.maps.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.SatelliteAlt
import androidx.compose.material.icons.outlined.Terrain
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/** The base-map switcher: a layers button that expands into Plan/Satellite/Relief. */
@Composable
fun LayersButton(
    current: BaseMap,
    onSelect: (BaseMap) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier, horizontalAlignment = Alignment.Start) {
        AnimatedVisibility(visible = expanded) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 4.dp,
                modifier = Modifier.padding(bottom = 8.dp),
            ) {
                Column(Modifier.padding(4.dp)) {
                    LayerOption(Icons.Outlined.Map, "Plan", current == BaseMap.PLAN) {
                        onSelect(BaseMap.PLAN); expanded = false
                    }
                    LayerOption(Icons.Outlined.SatelliteAlt, "Satellite", current == BaseMap.SATELLITE) {
                        onSelect(BaseMap.SATELLITE); expanded = false
                    }
                    LayerOption(Icons.Outlined.Terrain, "Relief", current == BaseMap.RELIEF) {
                        onSelect(BaseMap.RELIEF); expanded = false
                    }
                }
            }
        }
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.primary,
            shadowElevation = 4.dp,
            modifier = Modifier
                .size(44.dp)
                .selectable(selected = expanded) { expanded = !expanded },
        ) {
            Icon(
                Icons.Outlined.Layers,
                contentDescription = "Couches",
                modifier = Modifier.padding(10.dp),
            )
        }
    }
}

@Composable
private fun LayerOption(icon: ImageVector, label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.selectable(selected = selected, onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
