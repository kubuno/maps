package com.kubuno.maps.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Maps-only design language — a livelier, transit-app-inspired layer (Citymapper /
 * Transit / Waze) that sits on top of the shared KubunoTheme WITHOUT changing it,
 * so drive and mail keep their look. Bold rounded shapes, big numbers, saturated
 * mode/traffic colours, the Kubuno blue vivified.
 */
object MapsColors {
    // Brand accent (Kubuno) — vivified for big filled buttons.
    val Blue = Color(0xFF1A73E8)
    val BlueVivid = Color(0xFF2B7FFF)
    val BlueDeep = Color(0xFF0B3D91)

    // Transport-mode colours (round icons + pills), Citymapper/Transit style.
    val Walk = Color(0xFF34C759)
    val Cycle = Color(0xFF00C2A8)
    val Car = Color(0xFF1A73E8)
    val Transit = Color(0xFF7B61FF)
    val Gpx = Color(0xFFFF7A00)
    val Place = Color(0xFFFF375F)

    // Traffic semantics (Waze) — for colouring the route by congestion.
    val TrafficFree = Color(0xFF2ECC71)
    val TrafficLow = Color(0xFFFFC400)
    val TrafficMed = Color(0xFFFF8A00)
    val TrafficHigh = Color(0xFFFF3B30)
    val TrafficJam = Color(0xFFB71C1C)

    // Disruption / alert.
    val AlertBg = Color(0xFFFFF0EE)
    val AlertFg = Color(0xFFD7263D)

    fun forMode(mode: TravelMode): Color = when (mode) {
        TravelMode.DRIVING -> Car
        TravelMode.CYCLING -> Cycle
        TravelMode.FOOT -> Walk
    }
}

/** Big, bold, rounded type scale — the "bright lights, big font" of transit apps. */
object MapsType {
    private val Rounded = FontFamily.Default // system rounded-ish; a bundled Manrope/Figtree can drop in later
    val DisplayEta = TextStyle(fontFamily = Rounded, fontSize = 52.sp, lineHeight = 56.sp, fontWeight = FontWeight.ExtraBold)
    val DisplayEtaSm = TextStyle(fontFamily = Rounded, fontSize = 34.sp, lineHeight = 38.sp, fontWeight = FontWeight.ExtraBold)
    val TitlePunch = TextStyle(fontFamily = Rounded, fontSize = 22.sp, lineHeight = 26.sp, fontWeight = FontWeight.ExtraBold)
    val Section = TextStyle(fontFamily = Rounded, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold)
    val BodyStrong = TextStyle(fontFamily = Rounded, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    val LabelPill = TextStyle(fontFamily = Rounded, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.Bold)
}

/** Rounded corners used across the maps redesign. */
object MapsShape {
    val Card = RoundedCornerShape(20.dp)
    val Sheet = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    val Button = RoundedCornerShape(28.dp)
    val Pill = RoundedCornerShape(50)
}

/** A coloured, rounded transport-mode pill (icon + short label). */
@Composable
fun ModePill(icon: ImageVector, label: String, color: Color, modifier: Modifier = Modifier) {
    Surface(color = color, shape = MapsShape.Pill, modifier = modifier) {
        Row(
            Modifier.padding(start = 6.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text(
                label.uppercase(),
                style = MapsType.LabelPill,
                color = Color.White,
                modifier = Modifier.padding(start = 5.dp),
            )
        }
    }
}

/** A transport-mode icon in a solid coloured circle (Citymapper/Waze). */
@Composable
fun ModeIconCircle(icon: ImageVector, color: Color, size: Int = 40, modifier: Modifier = Modifier) {
    Surface(color = color, shape = CircleShape, modifier = modifier.size(size.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size((size * 0.55f).dp),
            )
        }
    }
}
