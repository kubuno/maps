//! HTTP surface for the 3D solar-system assets: a texture manifest, the
//! on-demand multi-resolution texture endpoint, and the star/constellation
//! catalogs. Together these replace the original PHP `texture.php` + `data/`.

use std::time::UNIX_EPOCH;

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    services::cosmos_service::{valid_texture_name, TexError, SIZES},
    state::AppState,
};

const WEEK: &str = "public, max-age=604800";

/// `filename → original width (px)` so the client knows each map's LOD ceiling.
pub async fn manifest(State(state): State<AppState>) -> Response {
    match state.cosmos.as_ref() {
        Some(c) => Json(&c.manifest).into_response(),
        None => Json(json!({})).into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct TextureParams {
    pub file: String,
    #[serde(default)]
    pub size: Option<u32>,
}

/// `/cosmos/texture?file=<name>&size=<256|512|1024|2048|4096|8192>` — serves the
/// texture at the requested width, downscaling into the disk cache on demand.
pub async fn texture(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<TextureParams>,
) -> Response {
    let Some(_) = state.cosmos.as_ref() else {
        return (StatusCode::NOT_FOUND, "Cosmos assets unavailable").into_response();
    };

    // `basename` guard mirrors the PHP; validation blocks path traversal.
    let file = params
        .file
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .to_string();
    let size = params.size.unwrap_or(1024);
    if !valid_texture_name(&file) || !SIZES.contains(&size) {
        return (StatusCode::BAD_REQUEST, "Invalid request").into_response();
    }

    let is_png = file.to_ascii_lowercase().ends_with(".png");

    // Image decode + disk I/O is blocking: keep it off the async runtime.
    let cosmos = state.cosmos.clone();
    let file_for_task = file.clone();
    let path = match tokio::task::spawn_blocking(move || {
        cosmos
            .as_ref()
            .as_ref()
            .expect("cosmos presence checked above")
            .texture_path(&file_for_task, size)
    })
    .await
    {
        Ok(Ok(p)) => p,
        Ok(Err(TexError::NotFound)) => {
            return (StatusCode::NOT_FOUND, "Unknown texture").into_response()
        }
        Ok(Err(_)) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Texture processing failed").into_response()
        }
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Texture task failed").into_response()
        }
    };

    // Weak validator from size+mtime — cheap and stable across restarts.
    let etag = match std::fs::metadata(&path) {
        Ok(meta) => {
            let len = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("\"{len:x}-{mtime:x}\"")
        }
        Err(_) => return (StatusCode::NOT_FOUND, "Texture vanished").into_response(),
    };

    if headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        == Some(etag.as_str())
    {
        return (
            StatusCode::NOT_MODIFIED,
            [(header::ETAG, etag.clone()), (header::CACHE_CONTROL, WEEK.to_string())],
        )
            .into_response();
    }

    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::NOT_FOUND, "Texture read failed").into_response(),
    };
    let ctype = if is_png { "image/png" } else { "image/jpeg" };

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, ctype.to_string()),
            (header::CACHE_CONTROL, WEEK.to_string()),
            (header::ETAG, etag),
        ],
        bytes,
    )
        .into_response()
}

/// `/cosmos/data/:file` — the star and constellation catalogs (JSON).
pub async fn data(State(state): State<AppState>, Path(file): Path<String>) -> Response {
    let Some(cosmos) = state.cosmos.as_ref() else {
        return (StatusCode::NOT_FOUND, "Cosmos assets unavailable").into_response();
    };
    let Some(path) = cosmos.data_path(&file) else {
        return (StatusCode::NOT_FOUND, "Unknown data file").into_response();
    };
    match tokio::fs::read(&path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "application/json".to_string()),
                (header::CACHE_CONTROL, WEEK.to_string()),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Data read failed").into_response(),
    }
}
