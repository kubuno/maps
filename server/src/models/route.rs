use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedRoute {
    pub id:              Uuid,
    pub owner_id:        Uuid,
    pub name:            Option<String>,
    pub transport_mode:  String,
    pub waypoints:       serde_json::Value,
    pub distance_meters: Option<i32>,
    pub duration_secs:   Option<i32>,
    pub osrm_data:       serde_json::Value,
    pub created_at:      DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct WaypointDto {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Deserialize)]
pub struct CalculateRouteDto {
    // The frontend sends { lat, lng } objects; they are converted to [lat, lng]
    // for OsrmService (which reorders to lng,lat for the OSRM API).
    pub waypoints:    Vec<WaypointDto>,
    pub mode:         Option<String>,
    pub alternatives: Option<bool>,
    /// Requests turn-by-turn steps (legs[].steps[].maneuver). Costly, hence
    /// opt-in: only the advanced route panel asks for them.
    pub steps:        Option<bool>,
    /// Road classes to avoid (OSRM `exclude=`): any of `toll`, `motorway`, `ferry`.
    /// Optional; an empty list means no restriction.
    pub exclude:      Option<Vec<String>>,
}

/// Values accepted for `CalculateRouteDto::exclude` (OSRM class names).
pub const ALLOWED_EXCLUDES: &[&str] = &["toll", "motorway", "ferry"];

impl CalculateRouteDto {
    /// Coordinates in the shape OsrmService expects: [lat, lng] per point.
    pub fn coords(&self) -> Vec<[f64; 2]> {
        self.waypoints.iter().map(|w| [w.lat, w.lng]).collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsrmRoute {
    pub duration:  f64,
    pub distance:  f64,
    pub geometry:  serde_json::Value,
    pub legs:      Vec<serde_json::Value>,
}
