use axum::{
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;

use crate::{errors::MapsError, state::AppState};

#[derive(Debug, Deserialize)]
pub struct TileParams {
    pub key: Option<String>,
}

pub async fn proxy_tile(
    State(state): State<AppState>,
    Path((source, z, x, y)): Path<(String, u32, u32, String)>,
    Query(_params): Query<TileParams>,
) -> Result<Response, MapsError> {
    // Prefer the admin-set instance value; fall back to config.toml when the
    // setting was never changed from the compiled default.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let base = if cfg.tile_url == d.tile_url {
        state.settings.tile_server.url.as_str()
    } else {
        cfg.tile_url.as_str()
    };
    let tile_url = format!("{base}/{source}/{z}/{x}/{y}");

    let resp = state.http
        .get(&tile_url)
        .send()
        .await
        .map_err(|_| MapsError::Internal(anyhow::anyhow!("Tile server unavailable")))?;

    let content_type = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| MapsError::Internal(anyhow::anyhow!("Tile read: {e}")))?;

    Ok((
        axum::http::StatusCode::OK,
        [(header::CONTENT_TYPE, content_type),
         (header::CACHE_CONTROL, "public, max-age=86400".to_string())],
        bytes,
    ).into_response())
}

pub async fn get_style(State(state): State<AppState>) -> impl IntoResponse {
    // Redirect client to the configured style.json endpoint. Prefer the
    // admin-set instance value, falling back to config.toml when unchanged.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let style_url = if cfg.tile_style_url == d.tile_style_url {
        state.settings.tile_server.style_url.clone()
    } else {
        cfg.tile_style_url.clone()
    };
    axum::Json(json!({ "style_url": style_url }))
}
