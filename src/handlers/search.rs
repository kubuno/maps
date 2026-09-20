use axum::{
    extract::{Extension, State},
    Json,
};
use chrono::{DateTime, Utc};
use kubuno_db::dialect::SqlType;
use kubuno_db::params;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::Result,
    middleware::MapsUser,
    state::AppState,
};

/// One search-history row, serialised straight to the response.
///
/// `result_lat`/`result_lng` are stored as DECIMAL on PostgreSQL, which sqlx
/// cannot decode as `f64` without the bigdecimal feature, so they are cast to a
/// double in the query (a no-op on MySQL's DOUBLE / SQLite's REAL columns).
#[derive(Debug, Serialize, sqlx::FromRow)]
struct HistoryRow {
    id:              Uuid,
    query:           String,
    result_name:     Option<String>,
    result_lat:      Option<f64>,
    result_lng:      Option<f64>,
    result_osm_type: Option<String>,
    result_osm_id:   Option<i64>,
    searched_at:     DateTime<Utc>,
}

pub async fn history(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let b = state.db.backend();
    let sql = format!(
        "SELECT id, query, result_name,
                {lat} AS result_lat, {lng} AS result_lng,
                result_osm_type, result_osm_id, searched_at
         FROM maps.search_history WHERE owner_id = $1
         ORDER BY searched_at DESC LIMIT 50",
        lat = b.cast("result_lat", SqlType::Double),
        lng = b.cast("result_lng", SqlType::Double),
    );
    let entries: Vec<HistoryRow> = state.db.fetch_all_as(&sql, params![user.id]).await?;

    Ok(Json(json!({ "history": entries })))
}

pub async fn clear_history(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    state
        .db
        .execute("DELETE FROM maps.search_history WHERE owner_id = $1", params![user.id])
        .await?;
    Ok(Json(json!({ "cleared": true })))
}
