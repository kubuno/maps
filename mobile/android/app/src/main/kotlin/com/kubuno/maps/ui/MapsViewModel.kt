package com.kubuno.maps.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kubuno.android.account.SharedAccount
import com.kubuno.android.account.SharedAccounts
import com.kubuno.maps.net.CreatePlaceBody
import com.kubuno.maps.net.MapsApi
import com.kubuno.maps.net.MapsClients
import com.kubuno.maps.net.NominatimResult
import com.kubuno.maps.net.SearchHistoryEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Base map styles, keyless OpenStreetMap-derived, mirroring the web module. */
object MapStyles {
    // The web's default base map (maps/frontend/src/mapsLayers.ts). The backend's
    // /config style_url defaults to a localhost tileserver that a phone can't
    // reach, so we use the same public vector style the web does and take only
    // the centre/zoom from /config.
    const val LIBERTY = "https://tiles.openfreemap.org/styles/liberty"
    const val POSITRON = "https://tiles.openfreemap.org/styles/positron"
}

/** What the map needs to first render: which account, where to look, how close. */
data class MapsUiState(
    val account: SharedAccount? = null,
    val ready: Boolean = false,
    val centerLat: Double = PARIS_LAT,
    val centerLng: Double = PARIS_LNG,
    val zoom: Double = DEFAULT_ZOOM,
    val styleUrl: String = MapStyles.LIBERTY,
) {
    companion object {
        const val PARIS_LAT = 48.8566
        const val PARIS_LNG = 2.3522
        const val DEFAULT_ZOOM = 12.0
    }
}

/** A place shown on the map and in the bottom card — from search, a POI, or a tap. */
data class SelectedPlace(
    val name: String,
    val category: String? = null,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    val osmType: String? = null,
    val osmId: Long? = null,
    val saved: Boolean = false,
    /** Camera flies to a place from search/tap, but not when it opens from a marker tap. */
    val focus: Boolean = true,
)

@HiltViewModel
class MapsViewModel @Inject constructor(
    sharedAccounts: SharedAccounts,
    private val clients: MapsClients,
) : ViewModel() {

    /** The shared Kubuno accounts this device knows; maps is a pure consumer. */
    val accounts: List<SharedAccount> = sharedAccounts.list()

    private val _state = MutableStateFlow(MapsUiState(account = accounts.firstOrNull()))
    val state: StateFlow<MapsUiState> = _state.asStateFlow()

    // ── Search ──────────────────────────────────────────────────────────────
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchActive = MutableStateFlow(false)
    val searchActive: StateFlow<Boolean> = _searchActive.asStateFlow()

    private val _results = MutableStateFlow<List<NominatimResult>>(emptyList())
    val results: StateFlow<List<NominatimResult>> = _results.asStateFlow()

    private val _searching = MutableStateFlow(false)
    val searching: StateFlow<Boolean> = _searching.asStateFlow()

    private val _history = MutableStateFlow<List<SearchHistoryEntry>>(emptyList())
    val history: StateFlow<List<SearchHistoryEntry>> = _history.asStateFlow()

    // ── Selected place (bottom card) ────────────────────────────────────────
    private val _selected = MutableStateFlow<SelectedPlace?>(null)
    val selected: StateFlow<SelectedPlace?> = _selected.asStateFlow()

    private var searchJob: Job? = null

    private val api: MapsApi?
        get() = _state.value.account?.let { clients.api(it) }

    init {
        loadConfig()
    }

    /** Pull the instance's default view; never fatal — Paris/zoom-12 is the fallback. */
    private fun loadConfig() {
        val account = _state.value.account ?: run {
            _state.value = _state.value.copy(ready = true)
            return
        }
        viewModelScope.launch {
            val config = withContext(Dispatchers.IO) {
                runCatching { clients.api(account).getConfig() }.getOrNull()
            }
            _state.value = _state.value.copy(
                ready = true,
                centerLat = config?.defaultLat ?: MapsUiState.PARIS_LAT,
                centerLng = config?.defaultLng ?: MapsUiState.PARIS_LNG,
                zoom = config?.defaultZoom ?: MapsUiState.DEFAULT_ZOOM,
            )
        }
    }

    // ── Search actions ──────────────────────────────────────────────────────

    fun openSearch() {
        _searchActive.value = true
        if (_history.value.isEmpty()) loadHistory()
    }

    fun closeSearch() {
        _searchActive.value = false
    }

    fun onQueryChange(text: String) {
        _query.value = text
        searchJob?.cancel()
        if (text.isBlank()) {
            _results.value = emptyList()
            _searching.value = false
            return
        }
        searchJob = viewModelScope.launch {
            delay(320) // debounce keystrokes before hitting Nominatim
            _searching.value = true
            val found = withContext(Dispatchers.IO) {
                runCatching { api?.geocodeSearch(q = text, limit = 12)?.results }
                    .onFailure { android.util.Log.w("MapsSearch", "geocode failed", it) }
                    .getOrNull()
            }
            _results.value = found ?: emptyList()
            _searching.value = false
        }
    }

    private fun loadHistory() {
        viewModelScope.launch {
            val h = withContext(Dispatchers.IO) {
                runCatching { api?.searchHistory()?.history }.getOrNull()
            }
            _history.value = h ?: emptyList()
        }
    }

    /** Pick a geocoding result → show it, close the search, fly the camera to it. */
    fun selectResult(result: NominatimResult) {
        val lat = result.latitude ?: return
        val lng = result.longitude ?: return
        _selected.value = SelectedPlace(
            name = result.displayName.substringBefore(','),
            category = result.kind ?: result.category,
            address = result.displayName,
            lat = lat,
            lng = lng,
            osmType = result.osmType,
            osmId = result.osmId,
        )
        _searchActive.value = false
    }

    /** Re-open a place from search history. */
    fun selectHistory(entry: SearchHistoryEntry) {
        val lat = entry.resultLat ?: return
        val lng = entry.resultLng ?: return
        _selected.value = SelectedPlace(
            name = entry.resultName ?: entry.query,
            address = entry.resultName,
            lat = lat,
            lng = lng,
            osmType = entry.resultOsmType,
            osmId = entry.resultOsmId,
        )
        _searchActive.value = false
    }

    /** Long-press on the map → "what's here?" via reverse geocoding. */
    fun reverseGeocode(lat: Double, lng: Double) {
        // Show the point immediately; enrich the label once the lookup returns.
        _selected.value = SelectedPlace(name = "Chargement…", lat = lat, lng = lng)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { api?.geocodeReverse(lat = lat, lng = lng)?.result }.getOrNull()
            }
            _selected.value = SelectedPlace(
                name = result?.displayName?.substringBefore(',') ?: "Lieu sans nom",
                category = result?.kind ?: result?.category,
                address = result?.displayName,
                lat = lat,
                lng = lng,
                osmType = result?.osmType,
                osmId = result?.osmId,
                focus = false,
            )
        }
    }

    fun clearSelection() {
        _selected.value = null
    }

    /** Save the current place to the account's favourites (POST /places). */
    fun savePlace() {
        val place = _selected.value ?: return
        if (place.saved) return
        val api = api ?: return
        viewModelScope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching {
                    api.createPlace(
                        CreatePlaceBody(
                            name = place.name,
                            category = place.category,
                            address = place.address,
                            lat = place.lat,
                            lng = place.lng,
                            osmType = place.osmType,
                            osmId = place.osmId,
                        ),
                    )
                }.isSuccess
            }
            if (ok) _selected.value = place.copy(saved = true)
        }
    }
}
