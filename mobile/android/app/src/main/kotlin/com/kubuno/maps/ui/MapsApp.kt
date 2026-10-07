package com.kubuno.maps.ui

import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.kubuno.android.account.SharedAccount
import com.kubuno.maps.R

@Composable
fun MapsApp(viewModel: MapsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val account = state.account
    if (state.ready && account == null) {
        NoAccount()
        return
    }
    if (account == null) return // still loading the config

    val searchActive by viewModel.searchActive.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val results by viewModel.results.collectAsStateWithLifecycle()
    val history by viewModel.history.collectAsStateWithLifecycle()
    val searching by viewModel.searching.collectAsStateWithLifecycle()
    val selected by viewModel.selected.collectAsStateWithLifecycle()
    val directions by viewModel.directions.collectAsStateWithLifecycle()
    val nav by viewModel.nav.collectAsStateWithLifecycle()
    val activeCategory by viewModel.activeCategory.collectAsStateWithLifecycle()
    val pois by viewModel.pois.collectAsStateWithLifecycle()
    val showLibrary by viewModel.showLibrary.collectAsStateWithLifecycle()
    val savedPlaces by viewModel.savedPlaces.collectAsStateWithLifecycle()
    val gpxTraces by viewModel.gpxTraces.collectAsStateWithLifecycle()
    val activeTrack by viewModel.activeTrack.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val baseMap by viewModel.baseMap.collectAsStateWithLifecycle()

    // Picks a .gpx document and uploads its bytes.
    val gpxPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            val name = queryDisplayName(context, uri)
            val bytes = runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            }.getOrNull()
            if (bytes != null) viewModel.uploadGpx(bytes, name)
        }
    }

    LaunchedEffect(message) {
        message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.clearMessage()
        }
    }

    var locationGranted by remember { mutableStateOf(hasLocationPermission(context)) }
    var recenterTick by remember { mutableIntStateOf(0) }
    var controller by remember { mutableStateOf<MapController?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        locationGranted = grants.values.any { it }
        if (locationGranted) recenterTick++
    }

    LaunchedEffect(Unit) {
        if (!locationGranted) {
            permissionLauncher.launch(
                arrayOf(
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    // The selection drives the map: drop/move the pin and frame the camera.
    LaunchedEffect(selected, controller) {
        val ctrl = controller ?: return@LaunchedEffect
        val place = selected
        if (place == null) {
            ctrl.clearSelected()
        } else {
            ctrl.showSelected(place.lat, place.lng)
            ctrl.flyTo(place.lat, place.lng, if (place.focus) 16.0 else null)
        }
    }

    // Directions drive the route lines and the camera fit.
    LaunchedEffect(directions.active, directions.routes, directions.selected, controller) {
        val ctrl = controller ?: return@LaunchedEffect
        if (!directions.active || directions.routes.isEmpty()) {
            ctrl.clearRoutes()
            return@LaunchedEffect
        }
        ctrl.clearSelected()
        ctrl.drawRoutes(directions.routes.map { it.points }, directions.selected)
        directions.routes.getOrNull(directions.selected)?.let { ctrl.fitBounds(it.points, 140) }
    }

    // If directions opened without a location fix, feed it in once available.
    LaunchedEffect(directions.needsLocation, locationGranted, controller) {
        if (directions.needsLocation) {
            controller?.lastLocation()?.let { viewModel.provideOrigin(it) }
        }
    }

    // Navigation drives a chase camera along the (simulated) position.
    LaunchedEffect(nav.active, nav.lat, nav.lng, controller) {
        val ctrl = controller ?: return@LaunchedEffect
        if (nav.active) ctrl.followNav(nav.lat, nav.lng, nav.bearing)
    }
    LaunchedEffect(nav.active) {
        if (!nav.active) controller?.resetTilt()
    }

    // POI markers follow the explore results; tapping one opens its card.
    LaunchedEffect(controller) {
        controller?.onPoiClick = { id ->
            viewModel.pois.value.firstOrNull { poiKey(it) == id }?.let { viewModel.selectPoi(it) }
        }
    }
    LaunchedEffect(pois, controller) {
        controller?.showPois(pois.map { PoiMarker(it.lat, it.lng, poiKey(it)) })
    }

    // Draw an opened GPX track and frame it; clear it when closed.
    LaunchedEffect(activeTrack, controller) {
        val ctrl = controller ?: return@LaunchedEffect
        val track = activeTrack
        if (track == null) {
            ctrl.clearTrack()
        } else {
            val pts = track.track.points.map { GeoPoint(it.lat, it.lng) }
            ctrl.drawTrack(pts)
            ctrl.fitBounds(pts, 120)
        }
    }

    // Load the account's places so the home sheet's "À proximité" has content.
    LaunchedEffect(Unit) { viewModel.loadSavedPlaces() }

    // The idle "home" state: nothing selected/searching/navigating.
    val homeState = selected == null && !directions.active && !nav.active &&
        activeTrack == null && !searchActive && !showLibrary
    val controlsBottom = 16.dp + if (homeState) HomeSheetPeek else 0.dp

    Box(Modifier.fillMaxSize()) {
        MapLibreMap(
            modifier = Modifier.fillMaxSize(),
            styleSpec = MapStyles.specFor(baseMap),
            styleKey = baseMap.name,
            initialLat = state.centerLat,
            initialLng = state.centerLng,
            initialZoom = state.zoom,
            locationEnabled = locationGranted,
            recenterTick = recenterTick,
            onControllerReady = { controller = it },
            onLongPress = { lat, lng -> viewModel.reverseGeocode(lat, lng) },
            onMapTap = { viewModel.clearSelection() },
        )

        if (!directions.active) {
            Column(
                Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .fillMaxWidth(),
            ) {
                SearchPill(
                    account = account,
                    onMenu = { viewModel.openLibrary() },
                    onClick = { viewModel.openSearch() },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                )
                CategoryChips(
                    active = activeCategory,
                    onToggle = { category ->
                        controller?.let { ctrl ->
                            val c = ctrl.currentCenter()
                            viewModel.toggleCategory(category.id, c.lat, c.lng, ctrl.viewportRadiusMeters())
                        }
                    },
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }
        }

        // Recentre FAB — hidden while a card or directions occupy the screen.
        AnimatedVisibility(
            visible = selected == null && !directions.active && activeTrack == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = controlsBottom),
        ) {
            FloatingActionButton(
                onClick = {
                    if (locationGranted) {
                        recenterTick++
                    } else {
                        permissionLauncher.launch(
                            arrayOf(
                                android.Manifest.permission.ACCESS_FINE_LOCATION,
                                android.Manifest.permission.ACCESS_COARSE_LOCATION,
                            ),
                        )
                    }
                },
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary,
            ) {
                Icon(Icons.Filled.MyLocation, contentDescription = stringResource(R.string.maps_my_location))
            }
        }

        // Base-map switcher, bottom-left, out of the way of any bottom card.
        AnimatedVisibility(
            visible = selected == null && !directions.active && activeTrack == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = controlsBottom),
        ) {
            LayersButton(current = baseMap, onSelect = { viewModel.setBaseMap(it) })
        }

        // Home sheet — favourites + big action + nearby, shown only when idle.
        AnimatedVisibility(
            visible = homeState,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding(),
        ) {
            HomeSheet(
                savedPlaces = savedPlaces,
                onSearch = { viewModel.openSearch() },
                onFavorite = { viewModel.openSearch() },
                onSelectPlace = { viewModel.selectSaved(it) },
            )
        }

        // Place card rises from the bottom when something is selected.
        AnimatedVisibility(
            visible = selected != null,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding(),
        ) {
            selected?.let { place ->
                PlaceCard(
                    place = place,
                    onClose = { viewModel.clearSelection() },
                    onDirections = { viewModel.startDirections(place, controller?.lastLocation()) },
                    onSave = { viewModel.savePlace() },
                    onShare = { sharePlace(context, place) },
                )
            }
        }

        // GPX track card rises from the bottom when a trace is opened.
        AnimatedVisibility(
            visible = activeTrack != null,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding(),
        ) {
            activeTrack?.let { track ->
                TrackCard(track = track, onClose = { viewModel.clearTrack() })
            }
        }

        // Directions: header on top, routes sheet at the bottom — hidden while navigating.
        if (directions.active && !nav.active) {
            DirectionsTopCard(
                state = directions,
                onClose = { viewModel.closeDirections() },
                onSwap = { viewModel.swapEndpoints() },
                onMode = { viewModel.setMode(it) },
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding(),
            )
            DirectionsSheet(
                state = directions,
                onSelectRoute = { viewModel.selectRoute(it) },
                onStart = { viewModel.startNavigation() },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding(),
            )
        }

        // Turn-by-turn HUD, over everything.
        if (nav.active) {
            NavOverlay(nav = nav, onQuit = { viewModel.stopNavigation() })
        }

        // Full-screen search on top of everything when active.
        if (searchActive) {
            SearchOverlay(
                query = query,
                results = results,
                history = history,
                searching = searching,
                onQueryChange = viewModel::onQueryChange,
                onBack = { viewModel.closeSearch() },
                onPick = viewModel::selectResult,
                onPickHistory = viewModel::selectHistory,
            )
        }

        // The library sheet (saved places + GPX traces), from the search bar menu.
        if (showLibrary) {
            LibrarySheet(
                places = savedPlaces,
                traces = gpxTraces,
                onSelectPlace = { viewModel.selectSaved(it) },
                onSelectTrace = { viewModel.selectTrace(it) },
                onDeleteTrace = { viewModel.deleteTrace(it) },
                onImportGpx = { gpxPicker.launch(arrayOf("application/gpx+xml", "application/octet-stream", "*/*")) },
                onDismiss = { viewModel.closeLibrary() },
            )
        }
    }
}

/** The picked document's display name (used as the GPX trace name). */
private fun queryDisplayName(context: android.content.Context, uri: android.net.Uri): String? =
    runCatching {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx)?.substringBeforeLast('.') else null
        }
    }.getOrNull()

/** Stable id for a POI marker (round-trips through the MapController on tap). */
private fun poiKey(poi: com.kubuno.maps.net.Poi): String = "${poi.osmType}/${poi.osmId}"

/** Shares a place as a standard geo: link plus a human line. */
private fun sharePlace(context: android.content.Context, place: SelectedPlace) {
    val geo = "geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${place.name})"
    val text = "${place.name}\n$geo"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, place.name)
    }
    context.startActivity(Intent.createChooser(intent, "Partager le lieu"))
}

@Composable
private fun SearchPill(
    account: SharedAccount,
    onMenu: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.extraLarge.copy(all = androidx.compose.foundation.shape.CornerSize(28.dp)),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
        shadowElevation = 3.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Outlined.Menu,
                contentDescription = "Lieux enregistrés",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable(onClick = onMenu)
                    .padding(2.dp),
            )
            Icon(
                Icons.Outlined.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(R.string.maps_search_hint),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(start = 2.dp),
            )
            AccountAvatar(account)
        }
    }
}

@Composable
private fun AccountAvatar(account: SharedAccount) {
    val initial = account.label.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    Surface(
        modifier = Modifier.size(30.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = initial,
                color = Color.White,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun NoAccount() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                text = stringResource(R.string.maps_no_account),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
