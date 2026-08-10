package com.kubuno.maps.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kubuno.android.account.SharedAccount
import com.kubuno.android.account.SharedAccounts
import com.kubuno.maps.net.CreatePlaceBody
import com.kubuno.maps.net.MapsApi
import com.kubuno.maps.net.MapsClients
import com.kubuno.maps.net.CalculateRouteBody
import com.kubuno.maps.net.LatLngBody
import com.kubuno.maps.net.NominatimResult
import com.kubuno.maps.net.OsrmRouteDto
import com.kubuno.maps.net.Poi
import com.kubuno.maps.net.SavedPlace
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

/** How a MapLibre style is loaded: a vector style URL, or a raw style JSON. */
sealed interface MapStyleSpec {
    data class Uri(val url: String) : MapStyleSpec
    data class Json(val json: String) : MapStyleSpec
}

/** The base maps offered by the layers switcher, mirroring the web module. */
enum class BaseMap { PLAN, SATELLITE, RELIEF }

/** Base map styles, keyless OpenStreetMap-derived, mirroring the web module. */
object MapStyles {
    // The web's default base map (maps/frontend/src/mapsLayers.ts). The backend's
    // /config style_url defaults to a localhost tileserver that a phone can't
    // reach, so we use the same public vector style the web does and take only
    // the centre/zoom from /config.
    const val LIBERTY = "https://tiles.openfreemap.org/styles/liberty"

    // Raster bases, same sources as the web (all keyless). ESRI uses {z}/{y}/{x};
    // MapLibre substitutes by name, so the order in the template is respected.
    private const val ESRI_SATELLITE =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    private const val OPENTOPO =
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png"

    fun specFor(base: BaseMap): MapStyleSpec = when (base) {
        BaseMap.PLAN -> MapStyleSpec.Uri(LIBERTY)
        BaseMap.SATELLITE -> MapStyleSpec.Json(rasterStyle(ESRI_SATELLITE, "© Esri, Maxar, Earthstar Geographics"))
        BaseMap.RELIEF -> MapStyleSpec.Json(rasterStyle(OPENTOPO, "© OpenTopoMap (CC-BY-SA)"))
    }

    /** A minimal MapLibre style wrapping a single raster tile source. */
    private fun rasterStyle(tilesUrl: String, attribution: String): String = """
        {
          "version": 8,
          "sources": {
            "raster-src": {
              "type": "raster",
              "tiles": ["$tilesUrl"],
              "tileSize": 256,
              "attribution": "$attribution"
            }
          },
          "layers": [
            { "id": "raster-layer", "type": "raster", "source": "raster-src" }
          ]
        }
    """.trimIndent()
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

/** A geographic point, kept free of any MapLibre type so the VM stays testable. */
data class GeoPoint(val lat: Double, val lng: Double)

/** One turn-by-turn instruction. */
data class RouteStep(val instruction: String, val distanceMeters: Double)

/** A computed itinerary: its shape, totals and steps. */
data class RouteOption(
    val distanceMeters: Double,
    val durationSeconds: Double,
    val points: List<GeoPoint>,
    val steps: List<RouteStep>,
)

/** The three OSRM profiles the module exposes, matching the web's mode buttons. */
enum class TravelMode(val api: String) { DRIVING("driving"), CYCLING("cycling"), FOOT("foot") }

/** A POI explore category (chip). Ids match the module's Overpass catalogue. */
data class PoiCategory(val id: String, val emoji: String, val label: String)

/** The curated "explore around" chips, mirroring the web's POI_CHIPS subset. */
val POI_CATEGORIES = listOf(
    PoiCategory("restaurant", "🍽️", "Restaurants"),
    PoiCategory("cafe", "☕", "Cafés"),
    PoiCategory("bar", "🍺", "Bars"),
    PoiCategory("hotel", "🏨", "Hôtels"),
    PoiCategory("supermarket", "🛒", "Commerces"),
    PoiCategory("pharmacy", "💊", "Pharmacies"),
    PoiCategory("fuel", "⛽", "Carburant"),
    PoiCategory("parking", "🅿️", "Parkings"),
    PoiCategory("museum", "🏛️", "Musées"),
    PoiCategory("hospital", "🏥", "Santé"),
    PoiCategory("atm", "🏧", "Distributeurs"),
    PoiCategory("transit", "🚏", "Transports"),
)

/** State of the directions flow: endpoints, mode, and the computed routes. */
data class DirectionsState(
    val active: Boolean = false,
    val originLabel: String = "Ma position",
    val origin: GeoPoint? = null,
    val destLabel: String = "",
    val dest: GeoPoint? = null,
    val mode: TravelMode = TravelMode.DRIVING,
    val routes: List<RouteOption> = emptyList(),
    val selected: Int = 0,
    val loading: Boolean = false,
    /** True when routing was asked for but no origin location is available yet. */
    val needsLocation: Boolean = false,
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

    // ── Directions ──────────────────────────────────────────────────────────
    private val _directions = MutableStateFlow(DirectionsState())
    val directions: StateFlow<DirectionsState> = _directions.asStateFlow()

    // ── Saved places + POI explore ────────────────────────────────────────────
    private val _savedPlaces = MutableStateFlow<List<SavedPlace>>(emptyList())
    val savedPlaces: StateFlow<List<SavedPlace>> = _savedPlaces.asStateFlow()

    private val _showSaved = MutableStateFlow(false)
    val showSaved: StateFlow<Boolean> = _showSaved.asStateFlow()

    private val _activeCategory = MutableStateFlow<String?>(null)
    val activeCategory: StateFlow<String?> = _activeCategory.asStateFlow()

    private val _pois = MutableStateFlow<List<Poi>>(emptyList())
    val pois: StateFlow<List<Poi>> = _pois.asStateFlow()

    // A one-shot user message (a transient failure the UI shows then clears).
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    // ── Base map (layers switcher) ────────────────────────────────────────────
    private val _baseMap = MutableStateFlow(BaseMap.PLAN)
    val baseMap: StateFlow<BaseMap> = _baseMap.asStateFlow()

    fun setBaseMap(base: BaseMap) {
        _baseMap.value = base
    }

    private var searchJob: Job? = null
    private var routeJob: Job? = null
    private var poiJob: Job? = null

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

    // ── Directions actions ────────────────────────────────────────────────────

    /** Open directions to the given place, starting from the device location. */
    fun startDirections(place: SelectedPlace, myLocation: GeoPoint?) {
        _selected.value = null
        _searchActive.value = false
        _directions.value = DirectionsState(
            active = true,
            origin = myLocation,
            originLabel = "Ma position",
            dest = GeoPoint(place.lat, place.lng),
            destLabel = place.name,
            needsLocation = myLocation == null,
        )
        computeRoute()
    }

    fun setMode(mode: TravelMode) {
        if (_directions.value.mode == mode) return
        _directions.value = _directions.value.copy(mode = mode)
        computeRoute()
    }

    fun selectRoute(index: Int) {
        _directions.value = _directions.value.copy(selected = index)
    }

    /** Swap origin and destination and recompute. */
    fun swapEndpoints() {
        val d = _directions.value
        _directions.value = d.copy(
            origin = d.dest,
            originLabel = d.destLabel,
            dest = d.origin,
            destLabel = d.originLabel,
        )
        computeRoute()
    }

    /** Supply the device location once it becomes available (origin was empty). */
    fun provideOrigin(myLocation: GeoPoint) {
        val d = _directions.value
        if (!d.active || d.origin != null) return
        _directions.value = d.copy(origin = myLocation, needsLocation = false)
        computeRoute()
    }

    fun closeDirections() {
        routeJob?.cancel()
        _directions.value = DirectionsState()
    }

    private fun computeRoute() {
        val d = _directions.value
        val origin = d.origin
        val dest = d.dest
        if (origin == null || dest == null) {
            _directions.value = d.copy(loading = false, routes = emptyList(), needsLocation = origin == null)
            return
        }
        val api = api ?: return
        routeJob?.cancel()
        routeJob = viewModelScope.launch {
            _directions.value = _directions.value.copy(loading = true, needsLocation = false)
            val raw = withContext(Dispatchers.IO) {
                runCatching {
                    api.calculateRoute(
                        CalculateRouteBody(
                            waypoints = listOf(
                                LatLngBody(origin.lat, origin.lng),
                                LatLngBody(dest.lat, dest.lng),
                            ),
                            mode = d.mode.api,
                            alternatives = true,
                            steps = true,
                        ),
                    ).routes
                }.onFailure { android.util.Log.w("MapsRoute", "route failed", it) }.getOrNull()
            }
            val parsed = raw?.map { it.toRouteOption() } ?: emptyList()
            _directions.value = _directions.value.copy(loading = false, routes = parsed, selected = 0)
        }
    }

    // ── Saved places ──────────────────────────────────────────────────────────

    fun openSaved() {
        _showSaved.value = true
        loadSavedPlaces()
    }

    fun closeSaved() {
        _showSaved.value = false
    }

    fun loadSavedPlaces() {
        val api = api ?: return
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) {
                runCatching { api.listPlaces().places }
                    .onFailure { android.util.Log.w("MapsPlaces", "list failed", it) }
                    .getOrNull()
            }
            _savedPlaces.value = list ?: emptyList()
        }
    }

    /** Open a saved place on the map (already a favourite, so the card marks it). */
    fun selectSaved(place: SavedPlace) {
        _showSaved.value = false
        _selected.value = SelectedPlace(
            name = place.name,
            category = place.category,
            address = place.address,
            lat = place.lat,
            lng = place.lng,
            osmType = place.osmType,
            osmId = place.osmId,
            saved = true,
        )
    }

    // ── POI explore (Overpass) ────────────────────────────────────────────────

    /** Toggle a category chip; when turned on, fetch POIs around the viewport. */
    fun toggleCategory(id: String, centerLat: Double, centerLng: Double, radiusMeters: Int) {
        if (_activeCategory.value == id) {
            _activeCategory.value = null
            _pois.value = emptyList()
            return
        }
        _activeCategory.value = id
        val api = api ?: return
        poiJob?.cancel()
        poiJob = viewModelScope.launch {
            val found = withContext(Dispatchers.IO) {
                runCatching {
                    api.overpassNearby(
                        lat = centerLat,
                        lng = centerLng,
                        radius = radiusMeters,
                        categories = id,
                    ).results
                }.onFailure { android.util.Log.w("MapsPoi", "nearby failed", it) }.getOrNull()
            }
            // Only apply if this category is still the active one.
            if (_activeCategory.value != id) return@launch
            if (found == null) {
                // Upstream (Overpass) failed — don't leave the chip stuck lit.
                _activeCategory.value = null
                _pois.value = emptyList()
                _message.value = "Points d'intérêt momentanément indisponibles"
            } else {
                _pois.value = found
                if (found.isEmpty()) _message.value = "Aucun lieu de cette catégorie à proximité"
            }
        }
    }

    fun clearMessage() {
        _message.value = null
    }

    fun clearCategory() {
        _activeCategory.value = null
        _pois.value = emptyList()
    }

    /** Open a POI marker in the place card. */
    fun selectPoi(poi: Poi) {
        _selected.value = SelectedPlace(
            name = poi.name ?: prettyPoiCategory(poi.category),
            category = poi.category,
            address = null,
            lat = poi.lat,
            lng = poi.lng,
            osmType = poi.osmType,
            osmId = poi.osmId,
            focus = false,
        )
    }
}

private fun prettyPoiCategory(raw: String?): String =
    raw?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: "Lieu"

// ── OSRM parsing (GeoJSON geometry + steps) ──────────────────────────────────

private fun OsrmRouteDto.toRouteOption(): RouteOption = RouteOption(
    distanceMeters = distance,
    durationSeconds = duration,
    points = parseLineString(geometry),
    steps = parseSteps(legs),
)

/** GeoJSON LineString → points. OSRM coordinates are [lng, lat]. */
private fun parseLineString(geometry: JsonObject): List<GeoPoint> {
    val coords = (geometry["coordinates"] as? JsonArray) ?: return emptyList()
    return coords.mapNotNull { c ->
        val arr = c as? JsonArray ?: return@mapNotNull null
        val lng = arr.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
        val lat = arr.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
        GeoPoint(lat, lng)
    }
}

private fun parseSteps(legs: JsonArray): List<RouteStep> {
    val out = mutableListOf<RouteStep>()
    for (leg in legs) {
        val steps = (leg.jsonObject["steps"] as? JsonArray) ?: continue
        for (step in steps) {
            val obj = step.jsonObject
            val maneuver = obj["maneuver"]?.jsonObject
            val type = maneuver?.get("type")?.jsonPrimitive?.contentString.orEmpty()
            val modifier = maneuver?.get("modifier")?.jsonPrimitive?.contentString
            val name = obj["name"]?.jsonPrimitive?.contentString.orEmpty()
            val dist = obj["distance"]?.jsonPrimitive?.doubleOrNull ?: 0.0
            out.add(RouteStep(maneuverText(type, modifier, name), dist))
        }
    }
    return out
}

private val kotlinx.serialization.json.JsonPrimitive.contentString: String?
    get() = if (this is kotlinx.serialization.json.JsonNull) null else content

/** OSRM maneuver type/modifier into a short French instruction. */
private fun maneuverText(type: String, modifier: String?, name: String): String {
    val dir = when (modifier) {
        "left", "slight left", "sharp left" -> "à gauche"
        "right", "slight right", "sharp right" -> "à droite"
        "uturn" -> "demi-tour"
        else -> null
    }
    val base = when (type) {
        "depart" -> "Départ"
        "arrive" -> "Arrivée"
        "turn" -> "Tournez" + (dir?.let { " $it" } ?: "")
        "continue" -> "Continuez" + (dir?.let { " $it" } ?: "")
        "merge" -> "Insérez-vous" + (dir?.let { " $it" } ?: "")
        "on ramp", "off ramp" -> "Prenez la bretelle" + (dir?.let { " $it" } ?: "")
        "fork" -> "Au embranchement, restez" + (dir?.let { " $it" } ?: "")
        "roundabout", "rotary" -> "Au rond-point"
        "end of road" -> "Au bout de la route, tournez" + (dir?.let { " $it" } ?: "")
        "new name" -> "Continuez"
        else -> "Continuez" + (dir?.let { " $it" } ?: "")
    }
    return if (name.isNotBlank() && type != "arrive") "$base sur $name" else base
}
