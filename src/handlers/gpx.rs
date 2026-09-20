use axum::{
    body::Bytes,
    extract::{Extension, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use kubuno_db::dialect::SqlType;
use kubuno_db::{params, DbPool};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{MapsError, Result},
    middleware::MapsUser,
    models::gpx::GpxTrace,
    services::gpx_service,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    pub name:          Option<String>,
    pub description:   Option<String>,
    pub activity_type: Option<String>,
}

/// The column list for a `GpxTrace`, with the DECIMAL distance/elevation columns
/// cast to a double so sqlx decodes them as `f64` (the cast is a no-op on MySQL's
/// DOUBLE and SQLite's REAL columns). Followed by a `WHERE ...` at the call site.
fn trace_select(db: &DbPool) -> String {
    let b = db.backend();
    format!(
        "SELECT id, owner_id, name, description, storage_path,
                {dm} AS distance_meters,
                {eg} AS elevation_gain,
                {el} AS elevation_loss,
                duration_secs, point_count, activity_type, recorded_at, is_public, created_at
         FROM maps.gpx_traces",
        dm = b.cast("distance_meters", SqlType::Double),
        eg = b.cast("elevation_gain", SqlType::Double),
        el = b.cast("elevation_loss", SqlType::Double),
    )
}

async fn fetch_trace(db: &DbPool, id: Uuid, owner_id: Uuid) -> Result<GpxTrace> {
    let sql = format!("{} WHERE id = $1 AND owner_id = $2", trace_select(db));
    db.fetch_optional_as::<GpxTrace>(&sql, params![id, owner_id])
        .await?
        .ok_or_else(|| MapsError::NotFound(format!("GPX trace {id}")))
}

pub async fn upload(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Query(q): Query<UploadQuery>,
    body: Bytes,
) -> Result<Json<Value>> {
    // Prefer the admin-set instance ceiling, falling back to config.toml when
    // unchanged from the compiled default.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let max_gpx_mb = if cfg.max_gpx_size_mb == d.max_gpx_size_mb {
        state.settings.maps.max_gpx_size_mb
    } else {
        cfg.max_gpx_size_mb
    };
    let max_bytes = max_gpx_mb * 1024 * 1024;
    if body.len() as u64 > max_bytes {
        return Err(MapsError::FileTooLarge);
    }

    // Per-user ceiling on the NUMBER of traces, checked before the file is parsed
    // and written to storage so a user over quota costs the instance nothing.
    // `0` means "no limit", the shipped behaviour.
    let max_traces = cfg.max_gpx_per_user;
    if max_traces > 0 {
        let count: i64 = state
            .db
            .fetch_scalar(
                &format!(
                    "SELECT {} FROM maps.gpx_traces WHERE owner_id = $1",
                    state.db.backend().count_bigint("*")
                ),
                params![user.id],
            )
            .await
            .map_err(|e| {
                tracing::error!(error = %e, user_id = %user.id, "Comptage des traces GPX");
                MapsError::Database(e)
            })?;

        if count as u64 >= max_traces {
            return Err(MapsError::Validation(format!(
                "Nombre maximal de traces GPX atteint ({max_traces})"
            )));
        }
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

    // The key is generated here and bound, then the row is read back by that key:
    // MySQL has no RETURNING, so this replaces the INSERT ... RETURNING.
    state
        .db
        .execute(
            "INSERT INTO maps.gpx_traces
                (id, owner_id, name, description, storage_path, distance_meters,
                 elevation_gain, elevation_loss, point_count,
                 bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng,
                 activity_type, recorded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
            params![
                trace_id,
                user.id,
                &name,
                q.description.clone(),
                &store_path,
                stats.distance_meters,
                stats.elevation_gain,
                stats.elevation_loss,
                stats.point_count as i32,
                bbox_min_lat,
                bbox_min_lng,
                bbox_max_lat,
                bbox_max_lng,
                activity_type,
                recorded_at,
            ],
        )
        .await?;

    let trace = fetch_trace(&state.db, trace_id, user.id).await?;
    Ok(Json(json!({ "trace": trace })))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
) -> Result<Json<Value>> {
    let sql = format!("{} WHERE owner_id = $1 ORDER BY created_at DESC", trace_select(&state.db));
    let traces: Vec<GpxTrace> = state.db.fetch_all_as(&sql, params![user.id]).await?;
    Ok(Json(json!({ "traces": traces })))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let trace = fetch_trace(&state.db, id, user.id).await?;
    Ok(Json(json!({ "trace": trace })))
}

pub async fn download(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Response> {
    let trace = fetch_trace(&state.db, id, user.id).await?;

    let bytes = state.storage.get(&trace.storage_path).await?;
    let filename = format!("{}.gpx", trace.name.replace(['/', '\\', '"'], "_"));

    Ok((
        axum::http::StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/gpx+xml".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{filename}\"")),
        ],
        bytes,
    ).into_response())
}

/// Profil de la trace (série élévation/distance + stats détaillées) pour le
/// graphique d'élévation et l'export GeoJSON côté client.
pub async fn track(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let trace = fetch_trace(&state.db, id, user.id).await?;
    let bytes = state.storage.get(&trace.storage_path).await?;
    let file = crate::services::gpx_service::parse_gpx(bytes.as_ref())?;
    let data = crate::services::gpx_service::track_data(&file, 600);
    Ok(Json(json!({ "track": data })))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<MapsUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    // MySQL has no DELETE ... RETURNING, so the storage path is read first and
    // the row deleted second. A missing path means the trace is absent (or not
    // this user's).
    let path: String = state
        .db
        .fetch_optional_scalar(
            "SELECT storage_path FROM maps.gpx_traces WHERE id = $1 AND owner_id = $2",
            params![id, user.id],
        )
        .await?
        .ok_or_else(|| MapsError::NotFound(format!("GPX trace {id}")))?;

    state
        .db
        .execute(
            "DELETE FROM maps.gpx_traces WHERE id = $1 AND owner_id = $2",
            params![id, user.id],
        )
        .await?;

    let _ = state.storage.delete(&path).await;

    Ok(Json(json!({ "deleted": true })))
}
