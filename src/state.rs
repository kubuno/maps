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
    /// Optional 3D solar-system texture/catalog assets (None if not located).
    pub cosmos:   Arc<Option<crate::services::cosmos_service::CosmosAssets>>,
}
