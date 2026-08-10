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

    Box(Modifier.fillMaxSize()) {
        MapLibreMap(
            modifier = Modifier.fillMaxSize(),
            styleUrl = state.styleUrl,
            initialLat = state.centerLat,
            initialLng = state.centerLng,
            initialZoom = state.zoom,
            locationEnabled = locationGranted,
            recenterTick = recenterTick,
            onControllerReady = { controller = it },
            onLongPress = { lat, lng -> viewModel.reverseGeocode(lat, lng) },
            onMapTap = { viewModel.clearSelection() },
        )

        SearchPill(
            account = account,
            onClick = { viewModel.openSearch() },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
        )

        // Recentre FAB — hidden while the place card occupies the bottom.
        AnimatedVisibility(
            visible = selected == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(16.dp),
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
                    onDirections = {
                        Toast.makeText(context, "Itinéraires — bientôt", Toast.LENGTH_SHORT).show()
                    },
                    onSave = { viewModel.savePlace() },
                    onShare = { sharePlace(context, place) },
                )
            }
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
    }
}

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
private fun SearchPill(account: SharedAccount, onClick: () -> Unit, modifier: Modifier = Modifier) {
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
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
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
