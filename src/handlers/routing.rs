use axum::{
    extract::{Extension, Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    models::route::CalculateRouteDto,
    services::osrm_service::OsrmService,
    state::AppState,
};

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

    let osrm = OsrmService::new(state.http.clone(), state.settings.osrm.url_for(profile).to_string());
    let resp = osrm
        .route(
            &dto.coords(),
            profile,
            dto.alternatives.unwrap_or(false),
            dto.steps.unwrap_or(false),
        )
        .await?;

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

    let row = sqlx::query(
        "INSERT INTO maps.saved_routes
            (owner_id, name, transport_mode, waypoints, distance_meters, duration_secs, osrm_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, owner_id, name, transport_mode, waypoints, distance_meters, duration_secs, osrm_data, created_at"
    )
    .bind(user.id)
    .bind(&name)
    .bind(mode)
    .bind(&waypts)
    .bind(distance)
    .bind(duration)
    .bind(&osrm_data)
    .fetch_one(&state.db)
    .await?;

    let route = json!({
        "id":               row.try_get::<Uuid, _>("id").unwrap_or_default(),
        "owner_id":         row.try_get::<Uuid, _>("owner_id").unwrap_or_default(),
        "name":             row.try_get::<Option<String>, _>("name").unwrap_or(None),
        "transport_mode":   row.try_get::<String, _>("transport_mode").unwrap_or_default(),
        "distance_meters":  row.try_get::<Option<i32>, _>("distance_meters").unwrap_or(None),
        "duration_secs":    row.try_get::<Option<i32>, _>("duration_secs").unwrap_or(None),
        "created_at":       row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").unwrap_or_default(),
    });

    Ok(Json(json!({ "route": route })))
}

pub async fn list_routes(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id, owner_id, name, transport_mode, waypoints, distance_meters, duration_secs, created_at
         FROM maps.saved_routes WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50"
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    let routes: Vec<Value> = rows.iter().map(|row| json!({
        "id":             row.try_get::<Uuid, _>("id").unwrap_or_default(),
        "name":           row.try_get::<Option<String>, _>("name").unwrap_or(None),
        "transport_mode": row.try_get::<String, _>("transport_mode").unwrap_or_default(),
        "distance_meters":row.try_get::<Option<i32>, _>("distance_meters").unwrap_or(None),
        "duration_secs":  row.try_get::<Option<i32>, _>("duration_secs").unwrap_or(None),
        "created_at":     row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").unwrap_or_default(),
    })).collect();

    Ok(Json(json!({ "routes": routes })))
}

pub async fn delete_route(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let r = sqlx::query("DELETE FROM maps.saved_routes WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?;

    if r.rows_affected() == 0 {
        return Err(MapsError::NotFound(format!("Route {id}")));
    }
    Ok(Json(json!({ "deleted": true })))
}
