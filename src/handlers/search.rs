use axum::{
    extract::{Extension, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::Row;

use crate::{
    errors::Result,
    middleware::MapsUser,
    state::AppState,
};

pub async fn history(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id, query, result_name, result_lat, result_lng,
                result_osm_type, result_osm_id, searched_at
         FROM maps.search_history WHERE owner_id = $1
         ORDER BY searched_at DESC LIMIT 50"
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<Value> = rows.iter().map(|row| json!({
        "id":              row.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
        "query":           row.try_get::<String, _>("query").unwrap_or_default(),
        "result_name":     row.try_get::<Option<String>, _>("result_name").unwrap_or(None),
        "result_lat":      row.try_get::<Option<f64>, _>("result_lat").unwrap_or(None),
        "result_lng":      row.try_get::<Option<f64>, _>("result_lng").unwrap_or(None),
        "result_osm_type": row.try_get::<Option<String>, _>("result_osm_type").unwrap_or(None),
        "result_osm_id":   row.try_get::<Option<i64>, _>("result_osm_id").unwrap_or(None),
        "searched_at":     row.try_get::<chrono::DateTime<chrono::Utc>, _>("searched_at").unwrap_or_default(),
    })).collect();

    Ok(Json(json!({ "history": entries })))
}

pub async fn clear_history(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    sqlx::query("DELETE FROM maps.search_history WHERE owner_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "cleared": true })))
}
