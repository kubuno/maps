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
    /// Instance settings from the admin console, refreshed in the background so
    /// an edit takes effect without restarting the module. A `std::sync` lock
    /// (not a `tokio` one) because callers read a snapshot synchronously; the
    /// critical section only clones a handful of fields.
    pub instance: Arc<std::sync::RwLock<crate::config::instance::InstanceConfig>>,
}

impl AppState {
    /// A snapshot of the current instance settings. Falls back to the compiled
    /// defaults if the lock was poisoned by a panicking writer — a lost value
    /// must never change a default silently.
    pub fn instance(&self) -> crate::config::instance::InstanceConfig {
        self.instance.read().map(|c| c.clone()).unwrap_or_default()
    }
}
