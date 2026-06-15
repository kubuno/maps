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
    // Le frontend envoie des objets { lat, lng } ; on les convertit en [lat, lng]
    // pour OsrmService (qui réordonne en lng,lat pour l'API OSRM).
    pub waypoints:    Vec<WaypointDto>,
    pub mode:         Option<String>,
    pub alternatives: Option<bool>,
}

impl CalculateRouteDto {
    /// Coordonnées au format attendu par OsrmService : [lat, lng] par point.
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
