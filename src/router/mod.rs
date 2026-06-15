use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, post},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    handlers::{geocode, gpx, health, places, routing, search, tiles},
    middleware::{require_auth, require_ipc_secret},
    state::AppState,
};

pub fn build(state: AppState) -> Router {
    let max_gpx = (state.settings.maps.max_gpx_size_mb * 1024 * 1024) as usize;

    // Routes authentifiées
    let authed = Router::new()
        // Config
        .route("/config", get(config_handler))
        // Geocoding
        .route("/geocode/search",  get(geocode::search))
        .route("/geocode/reverse", get(geocode::reverse))
        // Routing
        .route("/routes",          get(routing::list_routes).post(routing::calculate))
        .route("/routes/save",     post(routing::save_route))
        .route("/routes/:id",      delete(routing::delete_route))
        // Saved places
        .route("/places",          get(places::list).post(places::create))
        .route("/places/:id",      get(places::get).delete(places::delete))
        // Collections
        .route("/collections",     get(places::list_collections).post(places::create_collection))
        .route("/collections/:id", get(places::get_collection).delete(places::delete_collection))
        // Reviews
        .route("/reviews/:osm_type/:osm_id", get(places::list_reviews))
        .route("/reviews",                   post(places::create_review))
        .route("/reviews/:id",               delete(places::delete_review))
        // GPX traces
        .route("/gpx",       get(gpx::list).post(gpx::upload)
                                           .layer(DefaultBodyLimit::max(max_gpx)))
        .route("/gpx/:id",           get(gpx::get).delete(gpx::delete))
        .route("/gpx/:id/download",  get(gpx::download))
        // Search history
        .route("/search/history",    get(search::history).delete(search::clear_history))
        // Tiles
        .route("/tiles/style",                    get(tiles::get_style))
        .route("/tiles/:source/:z/:x/:y",         get(tiles::proxy_tile))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    // Health (no auth)
    let system = Router::new()
        .route("/health", get(health::health))
        .with_state(state.clone());

    // IPC events endpoint
    let ipc = Router::new()
        .route("/ipc/events", post(ipc_events))
        .layer(middleware::from_fn_with_state(state.clone(), require_ipc_secret))
        .with_state(state.clone());

    Router::new()
        .merge(system)
        .merge(ipc)
        .nest("/", authed)
        .layer(DefaultBodyLimit::disable())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

async fn config_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Extension(_user): axum::extract::Extension<crate::middleware::MapsUser>,
) -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "default_lat":  state.settings.maps.default_lat,
        "default_lng":  state.settings.maps.default_lng,
        "default_zoom": state.settings.maps.default_zoom,
        "style_url":    state.settings.tile_server.style_url,
    }))
}

async fn ipc_events(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::Json(body): axum::Json<serde_json::Value>,
) -> axum::Json<serde_json::Value> {
    if let Ok(event) = serde_json::from_value::<crate::events::MapEvent>(body) {
        crate::events::handle(event, &state.db).await;
    }
    axum::Json(serde_json::json!({ "ok": true }))
}
