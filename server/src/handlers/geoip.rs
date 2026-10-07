//! GeoIP lookup endpoint. Resolves an IP to a country (and coordinates, with a
//! City-level database). Exposed twice by the router: authenticated (`/geoip`,
//! for module frontends) and IPC-secret (`/internal/geoip`, for module backends
//! / background tasks with no user). `available:false` means no database loaded.

use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{errors::Result, state::AppState};

#[derive(Debug, Deserialize)]
pub struct GeoipQuery {
    pub ip: String,
}

pub async fn lookup(State(state): State<AppState>, Query(q): Query<GeoipQuery>) -> Result<Json<Value>> {
    let Some(resolver) = state.geoip.as_ref() else {
        // No database configured → tell the caller the service is unavailable
        // (so it can degrade gracefully rather than treat it as "unknown country").
        return Ok(Json(json!({ "available": false, "ip": q.ip })));
    };
    let loc = resolver.locate(q.ip.trim()).unwrap_or_default();
    Ok(Json(json!({
        "available": true,
        "ip": q.ip,
        "country": loc.country,
        "city": loc.city,
        "lat": loc.lat,
        "lng": loc.lng,
    })))
}
