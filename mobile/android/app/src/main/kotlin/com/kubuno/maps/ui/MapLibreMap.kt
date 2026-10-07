package com.kubuno.maps.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.location.LocationComponentActivationOptions
import org.maplibre.android.location.LocationComponentOptions
import org.maplibre.android.location.modes.CameraMode
import org.maplibre.android.location.modes.RenderMode
import android.graphics.Color
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.HillshadeLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.RasterDemSource
import org.maplibre.android.style.sources.TileSet

/**
 * A MapLibre [MapView] bound to the composition's lifecycle. Created once and
 * driven through the seven lifecycle callbacks MapLibre requires; destroyed when
 * it leaves composition.
 */
@Composable
private fun rememberMapViewWithLifecycle(): MapView {
    val context = LocalContext.current
    val mapView = remember { MapView(context).apply { onCreate(null) } }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        // onDestroy is driven here rather than on ON_DESTROY so the MapView is
        // released even if it leaves composition before the activity does.
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }
    return mapView
}

/**
 * The map surface. Loads the vector style, frames the initial camera, and — once
 * permission is granted — shows the "you are here" dot. [recenterTick] moves the
 * camera to the user's last known position each time it changes (the FAB bumps
 * it). [onMapReady] hands the live map + style to the caller for later layers.
 */
@Composable
fun MapLibreMap(
    styleSpec: MapStyleSpec,
    styleKey: String,
    initialLat: Double,
    initialLng: Double,
    initialZoom: Double,
    locationEnabled: Boolean,
    recenterTick: Int,
    modifier: Modifier = Modifier,
    onControllerReady: (MapController) -> Unit = {},
    onLongPress: (Double, Double) -> Unit = { _, _ -> },
    onMapTap: () -> Unit = {},
) {
    val context = LocalContext.current
    val mapView = rememberMapViewWithLifecycle()
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleRef by remember { mutableStateOf<Style?>(null) }
    val specRef by rememberUpdatedState(styleSpec)
    val controllerCb by rememberUpdatedState(onControllerReady)
    val longPressCb by rememberUpdatedState(onLongPress)
    val tapCb by rememberUpdatedState(onMapTap)

    fun applyStyle(map: MapLibreMap, spec: MapStyleSpec) {
        val builder = when (spec) {
            is MapStyleSpec.Uri -> Style.Builder().fromUri(spec.url)
            is MapStyleSpec.Json -> Style.Builder().fromJson(spec.json)
            is MapStyleSpec.Hillshade -> Style.Builder().fromUri(spec.baseUrl)
        }
        map.setStyle(builder) { style ->
            if (spec is MapStyleSpec.Hillshade) addReliefHillshade(style)
            styleRef = style
            // A fresh style means fresh managers/images — hand back a new controller.
            controllerCb(MapController(context, map, style, mapView))
        }
    }

    AndroidView(modifier = modifier, factory = { mapView }) { view ->
        if (mapRef == null) {
            view.getMapAsync { map ->
                map.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(initialLat, initialLng))
                    .zoom(initialZoom)
                    .build()
                map.addOnMapLongClickListener { point ->
                    longPressCb(point.latitude, point.longitude)
                    true
                }
                map.addOnMapClickListener {
                    tapCb()
                    false // don't consume — let annotation clicks still fire
                }
                applyStyle(map, specRef)
                mapRef = map
            }
        }
    }

    // Swap the base map when the layer changes (after the first load).
    LaunchedEffect(styleKey) {
        val map = mapRef ?: return@LaunchedEffect
        applyStyle(map, specRef)
    }

    // Turn the location component on once the style is ready and permission held.
    LaunchedEffect(locationEnabled, styleRef) {
        val map = mapRef ?: return@LaunchedEffect
        val style = styleRef ?: return@LaunchedEffect
        if (locationEnabled && hasLocationPermission(context)) {
            enableLocation(context, map, style)
        }
    }

    // Recentre on the user (FAB). Tick 0 is the initial state — ignore it.
    LaunchedEffect(recenterTick) {
        if (recenterTick == 0) return@LaunchedEffect
        val map = mapRef ?: return@LaunchedEffect
        val lc = map.locationComponent
        val loc = if (lc.isLocationComponentActivated) lc.lastKnownLocation else null
        if (loc != null) {
            map.animateCamera(
                CameraUpdateFactory.newLatLngZoom(LatLng(loc.latitude, loc.longitude), 15.0),
            )
        }
    }
}

@SuppressLint("MissingPermission") // guarded by the hasLocationPermission() caller
private fun enableLocation(context: Context, map: MapLibreMap, style: Style) {
    val lc = map.locationComponent
    // Re-activated on every style (re)load: the component binds to the style, so
    // a base-map switch would otherwise leave a dead "you are here" dot.
    lc.activateLocationComponent(
        LocationComponentActivationOptions.builder(context, style)
            .locationComponentOptions(
                LocationComponentOptions.builder(context)
                    .pulseEnabled(true)
                    .build(),
            )
            .useDefaultLocationEngine(true)
            .build(),
    )
    lc.isLocationComponentEnabled = true
    // The camera is not hijacked to follow — recentring is an explicit FAB action.
    lc.cameraMode = CameraMode.NONE
    lc.renderMode = RenderMode.COMPASS
}

/**
 * Adds a soft relief hillshade (terrarium DEM) UNDER the base's label layers, so
 * the terrain shading reads while streets and names stay legible — the reason
 * Relief uses the clean Positron base rather than raw OpenTopoMap.
 */
private fun addReliefHillshade(style: Style) {
    if (style.getLayer(HILLSHADE_LAYER) != null) return
    val tileSet = TileSet("2.1.0", MapStyles.TERRARIUM).apply { encoding = "terrarium" }
    style.addSource(RasterDemSource(HILLSHADE_DEM, tileSet, 256))
    val hillshade = HillshadeLayer(HILLSHADE_LAYER, HILLSHADE_DEM).withProperties(
        PropertyFactory.hillshadeExaggeration(0.45f),
        PropertyFactory.hillshadeShadowColor(Color.parseColor("#66404040")),
        PropertyFactory.hillshadeHighlightColor(Color.parseColor("#22FFFFFF")),
    )
    // Keep the shading beneath labels/symbols so text stays crisp.
    val firstSymbol = style.layers.firstOrNull { it is SymbolLayer }?.id
    if (firstSymbol != null) style.addLayerBelow(hillshade, firstSymbol) else style.addLayer(hillshade)
}

private const val HILLSHADE_DEM = "kubuno-relief-dem"
private const val HILLSHADE_LAYER = "kubuno-relief-hillshade"

fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(
        context, android.Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
