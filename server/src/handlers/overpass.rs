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
    State(state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    // POI lookups are an instance-level feature the admin can turn off. Returning
    // an empty catalogue here (rather than an error) is what makes the frontend
    // hide the category chips instead of showing a broken control.
    if !state.instance().enable_overpass {
        return Ok(Json(json!({ "categories": [] })));
    }

    let cats: Vec<Value> = CATEGORIES
        .iter()
        .map(|c| json!({ "id": c.id, "icon": c.icon }))
        .collect();
    Ok(Json(json!({ "categories": cats })))
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
    // Instance-level kill switch: when POI lookups are off the route behaves as
    // if it did not exist, and no outbound query leaves the instance.
    if !state.instance().enable_overpass {
        return Err(MapsError::Forbidden);
    }

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

    // Prefer the admin-set instance values, falling back to config.toml when a
    // setting was never changed from its compiled default.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let ov_url = if cfg.overpass_url == d.overpass_url {
        state.settings.overpass.url.clone()
    } else {
        cfg.overpass_url
    };
    let ov_timeout = if cfg.overpass_timeout_secs == d.overpass_timeout_secs {
        state.settings.overpass.timeout_secs
    } else {
        cfg.overpass_timeout_secs
    };
    let overpass = OverpassService::new(state.http.clone(), ov_url, ov_timeout);

    let results = overpass.nearby(q.lat, q.lng, q.radius, &cats, q.limit).await?;
    Ok(Json(json!({ "count": results.len(), "results": results })))
}
