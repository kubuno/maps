use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpxTrace {
    pub id:              Uuid,
    pub owner_id:        Uuid,
    pub name:            String,
    pub description:     Option<String>,
    pub storage_path:    String,
    pub distance_meters: Option<f64>,
    pub elevation_gain:  Option<f64>,
    pub elevation_loss:  Option<f64>,
    pub duration_secs:   Option<i32>,
    pub point_count:     i32,
    pub activity_type:   String,
    pub recorded_at:     Option<DateTime<Utc>>,
    pub is_public:       bool,
    pub created_at:      DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct GpxPoint {
    pub lat:       f64,
    pub lng:       f64,
    pub elevation: Option<f64>,
    pub time:      Option<DateTime<Utc>>,
    pub name:      Option<String>,
}

#[derive(Debug, Clone)]
pub struct GpxTrack {
    pub name:     Option<String>,
    pub segments: Vec<Vec<GpxPoint>>,
}

#[derive(Debug, Clone)]
pub struct GpxFile {
    pub name:        Option<String>,
    pub description: Option<String>,
    pub waypoints:   Vec<GpxPoint>,
    pub tracks:      Vec<GpxTrack>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GpxStats {
    pub distance_meters: f64,
    pub elevation_gain:  f64,
    pub elevation_loss:  f64,
    pub point_count:     u32,
    pub bbox:            [f64; 4],
}
