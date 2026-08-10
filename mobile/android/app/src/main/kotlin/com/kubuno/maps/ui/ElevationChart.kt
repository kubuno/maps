package com.kubuno.maps.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/**
 * A single sample of a GPX elevation profile: cumulative distance along the track
 * and the elevation at that point (both in meters).
 */
data class ElevationPoint(val distanceMeters: Double, val elevationMeters: Double)

/**
 * Draws a GPX elevation profile with a filled area under the line.
 *
 * X axis = cumulative distance (assumed increasing), Y axis = elevation.
 * The chart fills the width and height provided by [modifier]; the caller is
 * responsible for sizing it (e.g. `.height(120.dp).fillMaxWidth()`).
 *
 * @param points profile samples ordered by increasing distance.
 * @param lineColor color of the profile line.
 * @param fillColor color of the area under the line.
 */
@Composable
fun ElevationChart(
    points: List<ElevationPoint>,
    modifier: Modifier = Modifier,
    lineColor: Color = MaterialTheme.colorScheme.primary,
    fillColor: Color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
) {
    // Not enough data to draw a meaningful profile.
    if (points.size < 2) {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text(
                text = "Profil indisponible",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val strokePx = with(LocalDensity.current) { 2.dp.toPx() }

    // Compute value ranges once, outside the draw scope.
    val minDistance = points.first().distanceMeters
    val maxDistance = points.last().distanceMeters
    val distanceSpan = (maxDistance - minDistance).coerceAtLeast(0.0)

    val minElevation = points.minOf { it.elevationMeters }
    val maxElevation = points.maxOf { it.elevationMeters }
    val elevationSpan = maxElevation - minElevation

    Box(modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            // Guard against a zero-sized layout pass.
            if (w <= 0f || h <= 0f) return@Canvas

            // Vertical margin (~8%) so the line never touches the top/bottom edges.
            val vMargin = h * 0.08f
            val usableHeight = (h - 2f * vMargin).coerceAtLeast(0f)

            // Map a point to canvas coordinates. Y is inverted (screen grows downward).
            fun xFor(p: ElevationPoint): Float =
                if (distanceSpan <= 0.0) w / 2f
                else ((p.distanceMeters - minDistance) / distanceSpan * w).toFloat()

            fun yFor(p: ElevationPoint): Float {
                // Flat profile: center the line vertically.
                if (elevationSpan <= 0.0) return h / 2f
                val norm = (p.elevationMeters - minElevation) / elevationSpan
                return (vMargin + (1.0 - norm) * usableHeight).toFloat()
            }

            // Build the line path.
            val linePath = Path().apply {
                moveTo(xFor(points.first()), yFor(points.first()))
                for (i in 1 until points.size) {
                    lineTo(xFor(points[i]), yFor(points[i]))
                }
            }

            // Build the fill path: the line, then closed down to the baseline.
            val fillPath = Path().apply {
                addPath(linePath)
                lineTo(xFor(points.last()), h)
                lineTo(xFor(points.first()), h)
                close()
            }

            drawPath(path = fillPath, color = fillColor)
            drawPath(
                path = linePath,
                color = lineColor,
                style = Stroke(width = strokePx),
            )
        }

        // Discreet min/max elevation labels stacked in the top-left corner.
        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(4.dp),
        ) {
            Text(
                text = "max: ${maxElevation.roundToInt()} m",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "min: ${minElevation.roundToInt()} m",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
