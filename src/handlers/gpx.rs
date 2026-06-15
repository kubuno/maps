use axum::{
    body::Bytes,
    extract::{Extension, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    services::gpx_service,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    pub name:          Option<String>,
    pub description:   Option<String>,
    pub activity_type: Option<String>,
}

pub async fn upload(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Query(q): Query<UploadQuery>,
    body: Bytes,
) -> Result<Json<Value>> {
    let max_bytes = state.settings.maps.max_gpx_size_mb * 1024 * 1024;
    if body.len() as u64 > max_bytes {
        return Err(MapsError::FileTooLarge);
    }

    let gpx_file = gpx_service::parse_gpx(&body)?;
    let stats    = gpx_service::compute_stats(&gpx_file);

    let trace_id   = Uuid::new_v4();
    let store_path = format!("maps/{}/gpx/{}.gpx", user.id, trace_id);

    state.storage.put(&store_path, body).await?;

    let name = q.name
        .or_else(|| gpx_file.name.clone())
        .unwrap_or_else(|| "Trace GPX".to_string());

    let activity_type = q.activity_type.as_deref().unwrap_or("other");

    let recorded_at: Option<chrono::DateTime<chrono::Utc>> = gpx_file.tracks
        .first()
        .and_then(|t| t.segments.first())
        .and_then(|s| s.first())
        .and_then(|p| p.time);

    // bbox: [min_lat, min_lng, max_lat, max_lng]
    let (bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng) = if stats.bbox.len() == 4 {
        (Some(stats.bbox[0]), Some(stats.bbox[1]), Some(stats.bbox[2]), Some(stats.bbox[3]))
    } else {
        (None, None, None, None)
    };

    let row = sqlx::query(
        "INSERT INTO maps.gpx_traces
            (id, owner_id, name, description, storage_path, distance_meters,
             elevation_gain, elevation_loss, point_count,
             bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng,
             activity_type, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id, owner_id, name, description, storage_path,
                   CAST(distance_meters AS FLOAT8) AS distance_meters,
                   CAST(elevation_gain AS FLOAT8)  AS elevation_gain,
                   CAST(elevation_loss AS FLOAT8)  AS elevation_loss,
                   duration_secs, point_count, activity_type, recorded_at, is_public, created_at"
    )
    .bind(trace_id)
    .bind(user.id)
    .bind(&name)
    .bind(&q.description)
    .bind(&store_path)
    .bind(stats.distance_meters)
    .bind(stats.elevation_gain)
    .bind(stats.elevation_loss)
    .bind(stats.point_count as i32)
    .bind(bbox_min_lat)
    .bind(bbox_min_lng)
    .bind(bbox_max_lat)
    .bind(bbox_max_lng)
    .bind(activity_type)
    .bind(recorded_at)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({ "trace": row_to_trace(&row)? })))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id, owner_id, name, description, storage_path,
                CAST(distance_meters AS FLOAT8) AS distance_meters,
                CAST(elevation_gain  AS FLOAT8) AS elevation_gain,
                CAST(elevation_loss  AS FLOAT8) AS elevation_loss,
                duration_secs, point_count, activity_type, recorded_at, is_public, created_at
         FROM maps.gpx_traces WHERE owner_id = $1 ORDER BY created_at DESC"
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    let traces: Result<Vec<_>> = rows.iter().map(row_to_trace).collect();
    Ok(Json(json!({ "traces": traces? })))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let row = fetch_trace_row(&state.db, id, user.id).await?;
    Ok(Json(json!({ "trace": row_to_trace(&row)? })))
}

pub async fn download(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Response> {
    let row = fetch_trace_row(&state.db, id, user.id).await?;
    let storage_path: String = row.try_get("storage_path").map_err(MapsError::Database)?;
    let name: String = row.try_get("name").map_err(MapsError::Database)?;

    let bytes = state.storage.get(&storage_path).await?;
    let filename = format!("{}.gpx", name.replace(['/', '\\', '"'], "_"));

    Ok((
        axum::http::StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/gpx+xml".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{filename}\"")),
        ],
        bytes,
    ).into_response())
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let row = sqlx::query(
        "DELETE FROM maps.gpx_traces WHERE id = $1 AND owner_id = $2 RETURNING storage_path"
    )
    .bind(id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("GPX trace {id}")))?;

    let path: String = row.try_get("storage_path").map_err(MapsError::Database)?;
    let _ = state.storage.delete(&path).await;

    Ok(Json(json!({ "deleted": true })))
}

async fn fetch_trace_row(
    db:       &sqlx::PgPool,
    id:       Uuid,
    owner_id: Uuid,
) -> Result<sqlx::postgres::PgRow> {
    sqlx::query(
        "SELECT id, owner_id, name, description, storage_path,
                CAST(distance_meters AS FLOAT8) AS distance_meters,
                CAST(elevation_gain  AS FLOAT8) AS elevation_gain,
                CAST(elevation_loss  AS FLOAT8) AS elevation_loss,
                duration_secs, point_count, activity_type, recorded_at, is_public, created_at
         FROM maps.gpx_traces WHERE id = $1 AND owner_id = $2"
    )
    .bind(id)
    .bind(owner_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| MapsError::NotFound(format!("GPX trace {id}")))
}

fn row_to_trace(row: &sqlx::postgres::PgRow) -> Result<Value> {
    Ok(json!({
        "id":               row.try_get::<Uuid, _>("id").map_err(MapsError::Database)?,
        "owner_id":         row.try_get::<Uuid, _>("owner_id").map_err(MapsError::Database)?,
        "name":             row.try_get::<String, _>("name").map_err(MapsError::Database)?,
        "description":      row.try_get::<Option<String>, _>("description").unwrap_or(None),
        "storage_path":     row.try_get::<String, _>("storage_path").map_err(MapsError::Database)?,
        "distance_meters":  row.try_get::<Option<f64>, _>("distance_meters").unwrap_or(None),
        "elevation_gain":   row.try_get::<Option<f64>, _>("elevation_gain").unwrap_or(None),
        "elevation_loss":   row.try_get::<Option<f64>, _>("elevation_loss").unwrap_or(None),
        "duration_secs":    row.try_get::<Option<i32>, _>("duration_secs").unwrap_or(None),
        "point_count":      row.try_get::<i32, _>("point_count").map_err(MapsError::Database)?,
        "activity_type":    row.try_get::<String, _>("activity_type").map_err(MapsError::Database)?,
        "recorded_at":      row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("recorded_at").unwrap_or(None),
        "is_public":        row.try_get::<bool, _>("is_public").unwrap_or(false),
        "created_at":       row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map_err(MapsError::Database)?,
    }))
}
