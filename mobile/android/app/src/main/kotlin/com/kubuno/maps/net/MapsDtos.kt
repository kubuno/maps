package com.kubuno.maps.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

@Serializable
data class MapsConfigDto(
    @SerialName("default_lat") val defaultLat: Double,
    @SerialName("default_lng") val defaultLng: Double,
    @SerialName("default_zoom") val defaultZoom: Double,
    @SerialName("style_url") val styleUrl: String,
)

// ---------------------------------------------------------------------------
// Geocoding (Nominatim)
// ---------------------------------------------------------------------------

@Serializable
data class NominatimResult(
    @SerialName("place_id") val placeId: Long? = null,
    @SerialName("osm_type") val osmType: String? = null,
    @SerialName("osm_id") val osmId: Long? = null,
    @SerialName("display_name") val displayName: String,
    // Backend serializes these as strings.
    val lat: String,
    val lon: String,
    val category: String? = null,
    @SerialName("type") val kind: String? = null,
    val importance: Double? = null,
    val address: JsonObject? = null,
    val boundingbox: List<String>? = null,
    val extratags: JsonObject? = null,
    val namedetails: JsonObject? = null,
) {
    val latitude: Double? get() = lat.toDoubleOrNull()
    val longitude: Double? get() = lon.toDoubleOrNull()
}

@Serializable
data class GeocodeSearchDto(val results: List<NominatimResult>)

@Serializable
data class GeocodeReverseDto(val result: NominatimResult)

// ---------------------------------------------------------------------------
// POIs (Overpass)
// ---------------------------------------------------------------------------

@Serializable
data class Poi(
    @SerialName("osm_type") val osmType: String,
    @SerialName("osm_id") val osmId: Long,
    val lat: Double,
    val lng: Double,
    val name: String? = null,
    val category: String? = null,
    val icon: String? = null,
    val tags: JsonObject? = null,
)

@Serializable
data class PoiCategoryDto(
    val id: String,
    val icon: String, // emoji
)

@Serializable
data class PoiCategoriesDto(val categories: List<PoiCategoryDto>)

@Serializable
data class NearbyDto(
    val count: Int,
    val results: List<Poi>,
)

// ---------------------------------------------------------------------------
// Saved places
// ---------------------------------------------------------------------------

@Serializable
data class SavedPlace(
    val id: String,
    @SerialName("owner_id") val ownerId: String? = null,
    @SerialName("collection_id") val collectionId: String? = null,
    @SerialName("osm_type") val osmType: String? = null,
    @SerialName("osm_id") val osmId: Long? = null,
    @SerialName("place_id") val placeId: String? = null,
    val name: String,
    val category: String? = null,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    @SerialName("user_note") val userNote: String? = null,
    @SerialName("user_tags") val userTags: List<String> = emptyList(),
    val icon: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class PlacesDto(val places: List<SavedPlace>)

@Serializable
data class PlaceDto(val place: SavedPlace)

@Serializable
data class CreatePlaceBody(
    @SerialName("collection_id") val collectionId: String? = null,
    @SerialName("osm_type") val osmType: String? = null,
    @SerialName("osm_id") val osmId: Long? = null,
    @SerialName("place_id") val placeId: String? = null,
    val name: String,
    val category: String? = null,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    @SerialName("user_note") val userNote: String? = null,
    @SerialName("user_tags") val userTags: List<String>? = null,
    val icon: String? = null,
)

@Serializable
data class UpdatePlaceBody(
    val name: String? = null,
    @SerialName("user_note") val userNote: String? = null,
    @SerialName("user_tags") val userTags: List<String>? = null,
    val icon: String? = null,
    @SerialName("collection_id") val collectionId: String? = null,
)

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

@Serializable
data class PlaceCollection(
    val id: String,
    @SerialName("owner_id") val ownerId: String? = null,
    val name: String,
    val description: String? = null,
    val icon: String? = null,
    val color: String? = null,
    @SerialName("is_public") val isPublic: Boolean = false,
    @SerialName("place_count") val placeCount: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class CollectionsDto(val collections: List<PlaceCollection>)

@Serializable
data class CollectionDto(val collection: PlaceCollection)

@Serializable
data class CollectionDetailDto(
    val collection: PlaceCollection,
    val places: List<SavedPlace>,
)

@Serializable
data class CreateCollectionBody(
    val name: String,
    val description: String? = null,
    val icon: String? = null,
    val color: String? = null,
    @SerialName("is_public") val isPublic: Boolean? = null,
)

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

@Serializable
data class LatLngBody(
    val lat: Double,
    val lng: Double,
)

@Serializable
data class CalculateRouteBody(
    val waypoints: List<LatLngBody>,
    val mode: String? = "driving",
    val alternatives: Boolean? = true,
    val steps: Boolean? = true,
)

@Serializable
data class OsrmRouteDto(
    val duration: Double, // seconds
    val distance: Double, // meters
    val geometry: JsonObject, // GeoJSON LineString
    val legs: JsonArray, // contains steps[].maneuver when requested
    val weight: Double? = null,
    @SerialName("weight_name") val weightName: String? = null,
)

@Serializable
data class RouteCalcDto(
    val routes: List<OsrmRouteDto>,
    val mode: String,
)

@Serializable
data class SavedRouteSummary(
    val id: String,
    val name: String? = null,
    @SerialName("transport_mode") val transportMode: String,
    @SerialName("distance_meters") val distanceMeters: Int? = null,
    @SerialName("duration_secs") val durationSecs: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class SavedRoutesDto(val routes: List<SavedRouteSummary>)

// ---------------------------------------------------------------------------
// Search history
// ---------------------------------------------------------------------------

@Serializable
data class SearchHistoryEntry(
    val id: String,
    val query: String,
    @SerialName("result_name") val resultName: String? = null,
    @SerialName("result_lat") val resultLat: Double? = null,
    @SerialName("result_lng") val resultLng: Double? = null,
    @SerialName("result_osm_type") val resultOsmType: String? = null,
    @SerialName("result_osm_id") val resultOsmId: Long? = null,
    @SerialName("searched_at") val searchedAt: String? = null,
)

@Serializable
data class SearchHistoryDto(val history: List<SearchHistoryEntry>)
