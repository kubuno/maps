use axum::{
    extract::{Extension, Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use kubuno_db::params;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    models::route::{CalculateRouteDto, ALLOWED_EXCLUDES},
    services::osrm_service::OsrmService,
    state::AppState,
};

/// The subset of `saved_routes` returned to the client (the geometry and OSRM
/// payload are intentionally left out of the list/save responses).
#[derive(Debug, sqlx::FromRow)]
struct RouteBrief {
    id:              Uuid,
    owner_id:        Uuid,
    name:            Option<String>,
    transport_mode:  String,
    distance_meters: Option<i32>,
    duration_secs:   Option<i32>,
    created_at:      DateTime<Utc>,
}

const ROUTE_BRIEF_COLS: &str =
    "id, owner_id, name, transport_mode, distance_meters, duration_secs, created_at";

pub async fn calculate(
    State(state): State<AppState>,
    Extension(_user): Extension<MapsUser>,
    Json(dto): Json<CalculateRouteDto>,
) -> Result<Json<Value>> {
    if dto.waypoints.len() < 2 {
        return Err(MapsError::Validation("Au moins 2 points requis".into()));
    }

    let profile = dto.mode.as_deref().unwrap_or("driving");
    let allowed = &state.settings.osrm.profiles;
    if !allowed.iter().any(|p| p == profile) {
        return Err(MapsError::Validation(format!("Profil inconnu: {profile}")));
    }

    // Classes to avoid: validated against the closed list before anything is
    // forwarded to OSRM (never relay arbitrary strings to the upstream URL).
    let exclude: Vec<String> = dto.exclude.clone().unwrap_or_default();
    if let Some(bad) = exclude.iter().find(|e| !ALLOWED_EXCLUDES.contains(&e.as_str())) {
        return Err(MapsError::Validation(format!("Exclusion inconnue: {bad}")));
    }

    // Prefer the admin-set instance OSRM base. Because the config carries
    // per-profile overrides (public FOSSGIS servers) that shadow the base URL,
    // the instance value only applies once the admin changed it from the
    // compiled default; left untouched, routing keeps the per-profile config
    // behaviour so it still works out of the box.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let osrm_url = if cfg.osrm_url == d.osrm_url {
        state.settings.osrm.url_for(profile).to_string()
    } else {
        cfg.osrm_url
    };
    let osrm = OsrmService::new(state.http.clone(), osrm_url);
    let resp = osrm
        .route(
            &dto.coords(),
            profile,
            dto.alternatives.unwrap_or(false),
            dto.steps.unwrap_or(false),
            &exclude,
        )
        .await?;

    // Public OSRM servers are not built with every exclude combination: tell
    // the client precisely so it can retry without restrictions.
    if resp.is_exclude_unsupported() {
        return Err(MapsError::ExcludeUnsupported);
    }
    if resp.code != "Ok" {
        return Err(MapsError::RoutingFailed(resp.code));
    }

    let routes = resp.routes.unwrap_or_default();
    Ok(Json(json!({ "routes": routes, "mode": profile })))
}

pub async fn save_route(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let name     = body["name"].as_str().map(|s| s.to_string());
    let mode     = body["mode"].as_str().unwrap_or("driving");
    let waypts   = body["waypoints"].clone();
    let distance = body["distance_meters"].as_f64().map(|v| v as i32);
    let duration = body["duration_secs"].as_f64().map(|v| v as i32);
    let osrm_data = body["osrm_data"].clone();

    // Generate the key in Rust and read the row back by it: MySQL has no
    // RETURNING, and the DEFAULT gen_random_uuid() has no equivalent there.
    let route_id = kubuno_db::new_id();
    state
        .db
        .execute(
            "INSERT INTO maps.saved_routes
                (id, owner_id, name, transport_mode, waypoints, distance_meters, duration_secs, osrm_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            params![route_id, user.id, name, mode, waypts, distance, duration, osrm_data],
        )
        .await?;

    let r: RouteBrief = state
        .db
        .fetch_one_as(
            &format!("SELECT {ROUTE_BRIEF_COLS} FROM maps.saved_routes WHERE id = $1"),
            params![route_id],
        )
        .await?;

    let route = json!({
        "id":               r.id,
        "owner_id":         r.owner_id,
        "name":             r.name,
        "transport_mode":   r.transport_mode,
        "distance_meters":  r.distance_meters,
        "duration_secs":    r.duration_secs,
        "created_at":       r.created_at,
    });

    Ok(Json(json!({ "route": route })))
}

pub async fn list_routes(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows: Vec<RouteBrief> = state
        .db
        .fetch_all_as(
            &format!(
                "SELECT {ROUTE_BRIEF_COLS} FROM maps.saved_routes
                 WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50"
            ),
            params![user.id],
        )
        .await?;

    let routes: Vec<Value> = rows.iter().map(|r| json!({
        "id":             r.id,
        "name":           r.name,
        "transport_mode": r.transport_mode,
        "distance_meters":r.distance_meters,
        "duration_secs":  r.duration_secs,
        "created_at":     r.created_at,
    })).collect();

    Ok(Json(json!({ "routes": routes })))
}

pub async fn delete_route(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let affected = state
        .db
        .execute(
            "DELETE FROM maps.saved_routes WHERE id = $1 AND owner_id = $2",
            params![id, user.id],
        )
        .await?;

    if affected == 0 {
        return Err(MapsError::NotFound(format!("Route {id}")));
    }
    Ok(Json(json!({ "deleted": true })))
}
