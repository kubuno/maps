use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, post},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    handlers::{cosmos, geocode, geoip, gpx, health, overpass, places, routing, search, sketches, tiles},
    middleware::{require_auth, require_ipc_secret},
    state::AppState,
};

pub fn build(state: AppState) -> Router {
    // Body-limit ceiling from the instance settings (a startup snapshot; changing
    // it takes a restart), falling back to config.toml when unchanged. The live
    // per-request check in `gpx::upload` reads the current value each time.
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let max_gpx_mb = if cfg.max_gpx_size_mb == d.max_gpx_size_mb {
        state.settings.maps.max_gpx_size_mb
    } else {
        cfg.max_gpx_size_mb
    };
    let max_gpx = (max_gpx_mb * 1024 * 1024) as usize;

    // Routes authentifiées
    let authed = Router::new()
        // Config
        .route("/config", get(config_handler))
        // Geocoding
        .route("/geocode/search",  get(geocode::search))
        .route("/geocode/reverse", get(geocode::reverse))
        // GeoIP (maps owns this service; other modules consume it over the API)
        .route("/geoip",           get(geoip::lookup))
        // POI / exploration (Overpass)
        .route("/overpass/categories", get(overpass::categories))
        .route("/overpass/nearby",     get(overpass::nearby))
        // Routing
        .route("/routes",          get(routing::list_routes).post(routing::calculate))
        .route("/routes/save",     post(routing::save_route))
        .route("/routes/:id",      delete(routing::delete_route))
        // Saved places
        .route("/places",          get(places::list).post(places::create))
        .route("/places/:id",      get(places::get).patch(places::update).delete(places::delete))
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
        .route("/gpx/:id/track",     get(gpx::track))
        // Search history
        .route("/search/history",    get(search::history).delete(search::clear_history))
        // Sketches (calques dessinés : mesure / dessin / annotations)
        .route("/sketches",          get(sketches::list).post(sketches::create))
        .route("/sketches/:id",      get(sketches::get).put(sketches::update).delete(sketches::delete))
        .route("/sketches/:id/share", post(sketches::share))
        // Tiles
        .route("/tiles/style",                    get(tiles::get_style))
        .route("/tiles/:source/:z/:x/:y",         get(tiles::proxy_tile))
        // Cosmos (3D solar-system): texture manifest, multi-resolution textures,
        // and the star/constellation catalogs.
        .route("/cosmos/manifest",                get(cosmos::manifest))
        .route("/cosmos/texture",                 get(cosmos::texture))
        .route("/cosmos/data/:file",              get(cosmos::data))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    // Health + lecture publique d'un croquis partagé (no auth)
    let system = Router::new()
        .route("/health", get(health::health))
        .route("/sketches/public/:token", get(sketches::get_public))
        .with_state(state.clone());

    // IPC events endpoint
    let ipc = Router::new()
        .route("/ipc/events", post(ipc_events))
        // GeoIP for module backends / background tasks (no user; IPC-secret only).
        .route("/internal/geoip", get(geoip::lookup))
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
    // Prefer the admin-set instance values, falling back to config.toml when a
    // setting was never changed from its compiled default. Coordinates use an
    // epsilon compare (an exact-equal default means "unchanged").
    let cfg = state.instance();
    let d   = crate::config::instance::InstanceConfig::default();
    let default_lat = if (cfg.default_lat - d.default_lat).abs() < f64::EPSILON {
        state.settings.maps.default_lat
    } else {
        cfg.default_lat
    };
    let default_lng = if (cfg.default_lng - d.default_lng).abs() < f64::EPSILON {
        state.settings.maps.default_lng
    } else {
        cfg.default_lng
    };
    let default_zoom = if cfg.default_zoom == d.default_zoom {
        state.settings.maps.default_zoom
    } else {
        cfg.default_zoom
    };
    let style_url = if cfg.tile_style_url == d.tile_style_url {
        state.settings.tile_server.style_url.clone()
    } else {
        cfg.tile_style_url.clone()
    };
    axum::Json(serde_json::json!({
        "default_lat":  default_lat,
        "default_lng":  default_lng,
        "default_zoom": default_zoom,
        "style_url":    style_url,
        // Feature flags the client needs in order to hide a control rather than
        // offer one that the server will refuse. The POI catalogue is built into
        // the frontend, so the flag — not an empty catalogue — is what tells it
        // to drop the category chips.
        "enable_overpass":       cfg.enable_overpass,
        // Whether the "share this sketch" control may offer to publish a link.
        "allow_sketch_sharing":  cfg.sketch_sharing.allows_new_link(),
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
