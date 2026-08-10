package com.kubuno.maps.net

import kotlinx.serialization.json.JsonObject
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// Retrofit surface for the maps module, proxied by the core under /api/v1/maps/*.
// baseUrl = serverUrl + "/" ; auth Bearer wired elsewhere via an interceptor.
interface MapsApi {

    // --- Config ---

    @GET("api/v1/maps/config")
    suspend fun getConfig(): MapsConfigDto

    // --- Geocoding ---

    @GET("api/v1/maps/geocode/search")
    suspend fun geocodeSearch(
        @Query("q") q: String,
        @Query("limit") limit: Int = 10,
        @Query("minlat") minLat: Double? = null,
        @Query("minlng") minLng: Double? = null,
        @Query("maxlat") maxLat: Double? = null,
        @Query("maxlng") maxLng: Double? = null,
        @Query("lang") lang: String? = null,
    ): GeocodeSearchDto

    @GET("api/v1/maps/geocode/reverse")
    suspend fun geocodeReverse(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("zoom") zoom: Int = 18,
    ): GeocodeReverseDto

    // --- Overpass (POIs) ---

    @GET("api/v1/maps/overpass/categories")
    suspend fun overpassCategories(): PoiCategoriesDto

    @GET("api/v1/maps/overpass/nearby")
    suspend fun overpassNearby(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius") radius: Int = 1500,
        @Query("categories") categories: String, // CSV
        @Query("limit") limit: Int = 120,
    ): NearbyDto

    // --- Routing ---

    @POST("api/v1/maps/routes")
    suspend fun calculateRoute(@Body body: CalculateRouteBody): RouteCalcDto

    @GET("api/v1/maps/routes")
    suspend fun listSavedRoutes(): SavedRoutesDto

    @POST("api/v1/maps/routes/save")
    suspend fun saveRoute(@Body body: JsonObject): JsonObject

    @DELETE("api/v1/maps/routes/{id}")
    suspend fun deleteRoute(@Path("id") id: String)

    // --- Places ---

    @GET("api/v1/maps/places")
    suspend fun listPlaces(
        @Query("collection_id") collectionId: String? = null,
    ): PlacesDto

    @POST("api/v1/maps/places")
    suspend fun createPlace(@Body body: CreatePlaceBody): PlaceDto

    @GET("api/v1/maps/places/{id}")
    suspend fun getPlace(@Path("id") id: String): PlaceDto

    @PATCH("api/v1/maps/places/{id}")
    suspend fun updatePlace(
        @Path("id") id: String,
        @Body body: UpdatePlaceBody,
    ): PlaceDto

    @DELETE("api/v1/maps/places/{id}")
    suspend fun deletePlace(@Path("id") id: String)

    // --- Collections ---

    @GET("api/v1/maps/collections")
    suspend fun listCollections(): CollectionsDto

    @POST("api/v1/maps/collections")
    suspend fun createCollection(@Body body: CreateCollectionBody): CollectionDto

    @GET("api/v1/maps/collections/{id}")
    suspend fun getCollection(@Path("id") id: String): CollectionDetailDto

    @DELETE("api/v1/maps/collections/{id}")
    suspend fun deleteCollection(@Path("id") id: String)

    // --- Search history ---

    @GET("api/v1/maps/search/history")
    suspend fun searchHistory(): SearchHistoryDto

    @DELETE("api/v1/maps/search/history")
    suspend fun clearSearchHistory()

    // --- GPX traces ---

    @GET("api/v1/maps/gpx")
    suspend fun listGpx(): GpxListDto

    /** Upload = the raw GPX file bytes (not multipart); name/activity as query. */
    @Headers("Content-Type: application/gpx+xml")
    @POST("api/v1/maps/gpx")
    suspend fun uploadGpx(
        @Body body: RequestBody,
        @Query("name") name: String? = null,
        @Query("activity_type") activityType: String? = null,
    ): GpxUploadDto

    @GET("api/v1/maps/gpx/{id}/track")
    suspend fun gpxTrack(@Path("id") id: String): GpxTrackDto

    @DELETE("api/v1/maps/gpx/{id}")
    suspend fun deleteGpx(@Path("id") id: String)
}
