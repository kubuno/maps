use axum::{
    extract::{Extension, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    services::nominatim_service::NominatimService,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q:      String,
    #[serde(default = "default_limit")]
    pub limit:  u32,
    pub minlat: Option<f64>,
    pub minlng: Option<f64>,
    pub maxlat: Option<f64>,
    pub maxlng: Option<f64>,
    pub lang:   Option<String>,
}

fn default_limit() -> u32 { 10 }

/// Resolves the Nominatim base URL and `Accept-Language`, preferring the
/// admin-set instance values and falling back to `config.toml` when a setting
/// was never changed from its compiled default.
fn nominatim_endpoint(state: &AppState) -> (String, String) {
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let url = if cfg.nominatim_url == d.nominatim_url {
        state.settings.nominatim.url.clone()
    } else {
        cfg.nominatim_url
    };
    let lang = if cfg.nominatim_lang == d.nominatim_lang {
        state.settings.nominatim.accept_language.clone()
    } else {
        cfg.nominatim_lang
    };
    (url, lang)
}

pub async fn search(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>> {
    if q.q.trim().is_empty() {
        return Err(MapsError::Validation("Requête vide".into()));
    }

    let (nom_url, nom_lang) = nominatim_endpoint(&state);
    let nominatim = NominatimService::new(state.http.clone(), nom_url, nom_lang);

    let bounds = match (q.minlat, q.minlng, q.maxlat, q.maxlng) {
        (Some(s), Some(w), Some(n), Some(e)) => Some([s, w, n, e]),
        _ => None,
    };

    let results = nominatim.search(&q.q, q.limit, bounds, q.lang.as_deref()).await?;

    // Persist to search history (best-effort)
    if let Some(first) = results.first() {
        let lat = first.lat.parse::<f64>().ok();
        let lng = first.lon.parse::<f64>().ok();
        let _ = sqlx::query(
            "INSERT INTO maps.search_history
                (owner_id, query, result_name, result_lat, result_lng, result_osm_type, result_osm_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(user.id)
        .bind(&q.q)
        .bind(&first.display_name)
        .bind(lat)
        .bind(lng)
        .bind(&first.osm_type)
        .bind(first.osm_id.map(|v| v as i64))
        .execute(&state.db)
        .await;
    }

    Ok(Json(json!({ "results": results })))
}

#[derive(Debug, Deserialize)]
pub struct ReverseQuery {
    pub lat:  f64,
    pub lng:  f64,
    #[serde(default = "default_zoom")]
    pub zoom: u8,
}

fn default_zoom() -> u8 { 18 }

pub async fn reverse(
    State(state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
    Query(q): Query<ReverseQuery>,
) -> Result<Json<Value>> {
    let (nom_url, nom_lang) = nominatim_endpoint(&state);
    let nominatim = NominatimService::new(state.http.clone(), nom_url, nom_lang);

    let result = nominatim.reverse(q.lat, q.lng, q.zoom).await?;
    Ok(Json(json!({ "result": result })))
}
