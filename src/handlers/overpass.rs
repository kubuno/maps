//! Recherche de POI par catégorie (Overpass) — « qu'y a-t-il autour de moi ».

use axum::{
    extract::{Extension, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    services::overpass_service::{OverpassService, CATEGORIES},
    state::AppState,
};

/// Catalogue des catégories de POI (pour les chips du frontend).
pub async fn categories(
    State(_state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
) -> Json<Value> {
    let cats: Vec<Value> = CATEGORIES
        .iter()
        .map(|c| json!({ "id": c.id, "icon": c.icon }))
        .collect();
    Json(json!({ "categories": cats }))
}

#[derive(Debug, Deserialize)]
pub struct NearbyQuery {
    pub lat:        f64,
    pub lng:        f64,
    #[serde(default = "default_radius")]
    pub radius:     u32,
    /// Catégories séparées par des virgules (ex. `restaurant,cafe,pharmacy`).
    pub categories: String,
    #[serde(default = "default_limit")]
    pub limit:      u32,
}

fn default_radius() -> u32 { 1500 }
fn default_limit() -> u32 { 120 }

/// POI autour d'un point pour une ou plusieurs catégories.
pub async fn nearby(
    State(state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
    Query(q): Query<NearbyQuery>,
) -> Result<Json<Value>> {
    if !(-90.0..=90.0).contains(&q.lat) || !(-180.0..=180.0).contains(&q.lng) {
        return Err(MapsError::Validation("Coordonnées invalides".into()));
    }
    let cats: Vec<String> = q
        .categories
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if cats.is_empty() {
        return Err(MapsError::Validation("Au moins une catégorie requise".into()));
    }

    let overpass = OverpassService::new(
        state.http.clone(),
        state.settings.overpass.url.clone(),
        state.settings.overpass.timeout_secs,
    );

    let results = overpass.nearby(q.lat, q.lng, q.radius, &cats, q.limit).await?;
    Ok(Json(json!({ "count": results.len(), "results": results })))
}
