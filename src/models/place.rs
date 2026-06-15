use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedPlace {
    pub id:             Uuid,
    pub owner_id:       Uuid,
    pub collection_id:  Option<Uuid>,
    pub osm_type:       Option<String>,
    pub osm_id:         Option<i64>,
    pub place_id:       Option<String>,
    pub name:           String,
    pub category:       Option<String>,
    pub address:        Option<String>,
    pub lat:            f64,
    pub lng:            f64,
    pub nominatim_data: serde_json::Value,
    pub user_note:      Option<String>,
    pub user_tags:      Vec<String>,
    pub icon:           String,
    pub created_at:     DateTime<Utc>,
    pub updated_at:     DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceCollection {
    pub id:          Uuid,
    pub owner_id:    Uuid,
    pub name:        String,
    pub description: Option<String>,
    pub icon:        String,
    pub color:       String,
    pub is_public:   bool,
    pub place_count: i32,
    pub created_at:  DateTime<Utc>,
    pub updated_at:  DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserReview {
    pub id:         Uuid,
    pub owner_id:   Uuid,
    pub osm_type:   String,
    pub osm_id:     i64,
    pub place_name: Option<String>,
    pub rating:     i16,
    pub comment:    Option<String>,
    pub tags:       Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlaceDto {
    pub collection_id:  Option<Uuid>,
    pub osm_type:       Option<String>,
    pub osm_id:         Option<i64>,
    pub place_id:       Option<String>,
    pub name:           String,
    pub category:       Option<String>,
    pub address:        Option<String>,
    pub lat:            f64,
    pub lng:            f64,
    pub nominatim_data: Option<serde_json::Value>,
    pub user_note:      Option<String>,
    pub user_tags:      Option<Vec<String>>,
    pub icon:           Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewDto {
    pub osm_type:   String,
    pub osm_id:     i64,
    pub place_name: Option<String>,
    pub rating:     i16,
    pub comment:    Option<String>,
    pub tags:       Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionDto {
    pub name:        String,
    pub description: Option<String>,
    pub icon:        Option<String>,
    pub color:       Option<String>,
    pub is_public:   Option<bool>,
}
