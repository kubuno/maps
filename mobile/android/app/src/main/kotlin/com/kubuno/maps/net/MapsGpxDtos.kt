package com.kubuno.maps.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// GPX traces: metadata list, upload result, and a resampled track with elevation.

@Serializable
data class GpxTrace(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    @SerialName("elevation_gain") val elevationGain: Double? = null,
    @SerialName("elevation_loss") val elevationLoss: Double? = null,
    @SerialName("duration_secs") val durationSecs: Long? = null,
    @SerialName("point_count") val pointCount: Int? = null,
    @SerialName("activity_type") val activityType: String? = null,
    @SerialName("recorded_at") val recordedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class GpxListDto(val traces: List<GpxTrace>)

@Serializable
data class GpxUploadDto(val trace: GpxTrace)

@Serializable
data class TrackPoint(
    val lat: Double,
    val lng: Double,
    val ele: Double? = null,
    /** Cumulative distance from the start, in metres. */
    val dist: Double = 0.0,
    val time: String? = null,
)

@Serializable
data class TrackData(
    val points: List<TrackPoint>,
    @SerialName("distance_meters") val distanceMeters: Double = 0.0,
    @SerialName("elevation_gain") val elevationGain: Double = 0.0,
    @SerialName("elevation_loss") val elevationLoss: Double = 0.0,
    @SerialName("min_elevation") val minElevation: Double? = null,
    @SerialName("max_elevation") val maxElevation: Double? = null,
    @SerialName("duration_secs") val durationSecs: Long? = null,
    @SerialName("avg_speed_ms") val avgSpeedMs: Double? = null,
    @SerialName("point_count") val pointCount: Int = 0,
    /** [min_lat, min_lng, max_lat, max_lng]. */
    val bbox: List<Double> = emptyList(),
)

@Serializable
data class GpxTrackDto(val track: TrackData)
