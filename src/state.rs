use crate::config::Settings;
use kubuno_storage::StorageBackend;
use reqwest::Client;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub db:       PgPool,
    pub settings: Arc<Settings>,
    pub storage:  Arc<dyn StorageBackend>,
    pub http:     Client,
    /// Optional offline GeoIP resolver (None unless an admin supplied a database).
    pub geoip:    Arc<Option<crate::services::geoip_service::GeoResolver>>,
}
