package com.kubuno.maps.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.appcompat.content.res.AppCompatResources
import com.kubuno.maps.R
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.plugins.annotation.Line
import org.maplibre.android.plugins.annotation.LineManager
import org.maplibre.android.plugins.annotation.LineOptions
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
    // Declared before the SymbolManager so route lines render UNDER the pins.
    private val lineManager = LineManager(mapView, map, style)
    private val symbolManager = SymbolManager(mapView, map, style).apply {
        iconAllowOverlap = true
        iconIgnorePlacement = true
    }

    private var selectedSymbol: Symbol? = null
    private val routeLines = mutableListOf<Line>()
    private val poiSymbols = mutableListOf<Symbol>()
    private val poiById = mutableMapOf<Long, String>()

    /** Invoked with a POI's id string when its marker is tapped. */
    var onPoiClick: ((String) -> Unit)? = null

    init {
        // Register the marker bitmaps under style image ids the symbols reference.
        style.addImage(PIN_IMAGE, drawableToBitmap(context, R.drawable.ic_map_pin))
        style.addImage(POI_IMAGE, drawableToBitmap(context, R.drawable.ic_poi_dot))
        symbolManager.addClickListener { symbol ->
            val id = poiById[symbol.id]
            if (id != null) {
                onPoiClick?.invoke(id)
                true
            } else {
                false
            }
        }
    }

    /** The current map centre. */
    fun currentCenter(): GeoPoint {
        val t = map.cameraPosition.target ?: return GeoPoint(0.0, 0.0)
        return GeoPoint(t.latitude, t.longitude)
    }

    /** Half the viewport, in metres, clamped like the web (300 m – 6 km). */
    fun viewportRadiusMeters(): Int {
        val center = map.cameraPosition.target ?: return 1500
        val ne = map.projection.visibleRegion.latLngBounds.northEast
        return center.distanceTo(ne).toInt().coerceIn(300, 6000)
    }

    /** Show the POI explore markers; [markers] carry the id passed back on tap. */
    fun showPois(markers: List<PoiMarker>) {
        clearPois()
        for (m in markers) {
            val sym = symbolManager.create(
                SymbolOptions()
                    .withLatLng(LatLng(m.lat, m.lng))
                    .withIconImage(POI_IMAGE)
                    .withIconAnchor("center"),
            )
            poiSymbols += sym
            poiById[sym.id] = m.id
        }
    }

    fun clearPois() {
        poiSymbols.forEach { symbolManager.delete(it) }
        poiSymbols.clear()
        poiById.clear()
    }

    /** The device's last known position, or null if location is off/unfixed. */
    fun lastLocation(): GeoPoint? {
        val lc = map.locationComponent
        if (!lc.isLocationComponentActivated) return null
        val loc = lc.lastKnownLocation ?: return null
        return GeoPoint(loc.latitude, loc.longitude)
    }

    /**
     * Draw the route alternatives; [selectedIndex] is stroked in the accent and
     * on top, the rest in grey underneath (the web's route styling).
     */
    fun drawRoutes(routes: List<List<GeoPoint>>, selectedIndex: Int) {
        clearRoutes()
        // Alternatives first, then the selected one, so the selected is on top.
        val order = routes.indices.sortedBy { it == selectedIndex }
        for (i in order) {
            val pts = routes[i].map { LatLng(it.lat, it.lng) }
            if (pts.size < 2) continue
            val selected = i == selectedIndex
            routeLines += lineManager.create(
                LineOptions()
                    .withLatLngs(pts)
                    .withLineColor(if (selected) ROUTE_SELECTED else ROUTE_ALT)
                    .withLineWidth(if (selected) 6f else 5f),
            )
        }
    }

    fun clearRoutes() {
        routeLines.forEach { lineManager.delete(it) }
        routeLines.clear()
    }

    /** Frame the camera around a set of points (e.g. the selected route). */
    fun fitBounds(points: List<GeoPoint>, paddingPx: Int) {
        if (points.size < 2) return
        val builder = LatLngBounds.Builder()
        points.forEach { builder.include(LatLng(it.lat, it.lng)) }
        val bounds = runCatching { builder.build() }.getOrNull() ?: return
        map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, paddingPx))
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
        const val POI_IMAGE = "kubuno-poi-dot"
        // Route colours mirror the web: selected accent blue, alternatives grey.
        const val ROUTE_SELECTED = "#1A73E8"
        const val ROUTE_ALT = "#9AA0A6"
    }
}

/** A POI marker: its position and the id echoed back to [MapController.onPoiClick]. */
data class PoiMarker(val lat: Double, val lng: Double, val id: String)

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
