package com.kubuno.maps.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.appcompat.content.res.AppCompatResources
import com.kubuno.maps.R
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.plugins.annotation.Symbol
import org.maplibre.android.plugins.annotation.SymbolManager
import org.maplibre.android.plugins.annotation.SymbolOptions

/**
 * Owns the map's managed annotations (markers). Created once the style is loaded;
 * everything drawn over the map — the selected-place pin now, POI markers in M4 —
 * goes through here rather than through raw style layers.
 */
class MapController(
    private val context: Context,
    val map: MapLibreMap,
    style: Style,
    mapView: MapView,
) {
    private val symbolManager = SymbolManager(mapView, map, style).apply {
        iconAllowOverlap = true
        iconIgnorePlacement = true
    }

    private var selectedSymbol: Symbol? = null

    init {
        // Register the pin bitmap under a style image id the symbols reference.
        style.addImage(PIN_IMAGE, drawableToBitmap(context, R.drawable.ic_map_pin))
    }

    /** Show (or move) the single selected-place pin. */
    fun showSelected(lat: Double, lng: Double) {
        clearSelected()
        selectedSymbol = symbolManager.create(
            SymbolOptions()
                .withLatLng(LatLng(lat, lng))
                .withIconImage(PIN_IMAGE)
                .withIconAnchor("bottom"),
        )
    }

    fun clearSelected() {
        selectedSymbol?.let { symbolManager.delete(it) }
        selectedSymbol = null
    }

    /** Ease the camera to a point; [zoom] null keeps the current zoom. */
    fun flyTo(lat: Double, lng: Double, zoom: Double? = null) {
        val update = if (zoom != null) {
            CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), zoom)
        } else {
            CameraUpdateFactory.newLatLng(LatLng(lat, lng))
        }
        map.animateCamera(update)
    }

    private companion object {
        const val PIN_IMAGE = "kubuno-place-pin"
    }
}

/** Rasterise a (vector) drawable so MapLibre can use it as a symbol image. */
private fun drawableToBitmap(context: Context, resId: Int): Bitmap {
    val drawable = AppCompatResources.getDrawable(context, resId)
        ?: error("missing drawable $resId")
    val width = drawable.intrinsicWidth.coerceAtLeast(1)
    val height = drawable.intrinsicHeight.coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, width, height)
    drawable.draw(canvas)
    return bitmap
}
