use config::{Config, ConfigError, Environment, File};
use kubuno_storage::StorageConfig;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub server:      ServerSettings,
    pub core:        CoreSettings,
    pub database:    DatabaseSettings,
    pub storage:     StorageConfig,
    pub tile_server: TileServerSettings,
    pub nominatim:   NominatimSettings,
    pub osrm:        OsrmSettings,
    pub overpass:    OverpassSettings,
    pub maps:        MapsSettings,
    #[serde(default)]
    pub geoip:       GeoipSettings,
    #[serde(default)]
    pub cosmos:      CosmosSettings,
    pub logging:     LoggingSettings,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GeoipSettings {
    /// Path to a MaxMind-format `.mmdb` (GeoLite2 / DB-IP). Optional; without it
    /// the /geoip service reports "unavailable".
    #[serde(default)]
    pub db_path: Option<String>,
}

/// 3D solar-system ("cosmos") assets: equirectangular planet textures and the
/// star/constellation catalogs. The backend serves textures at requested
/// resolutions (resizing on demand into a disk cache), a port of the original
/// PHP `texture.php`. Both paths are optional: when the asset directory can't
/// be located the cosmos view simply falls back to lower-resolution maps.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct CosmosSettings {
    /// Directory holding `textures/` and `data/`. When unset, a few standard
    /// locations are probed (installed module dir, then the working directory).
    #[serde(default)]
    pub assets_dir: Option<String>,
    /// Writable directory for the generated multi-resolution texture cache.
    #[serde(default)]
    pub cache_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CoreSettings {
    pub url:             String,
    pub internal_secret: String,
}

/// The `[database]` section is owned by kubuno-db: which of its fields matter
/// depends on the engine the administrator selected (`database.engine`), and the
/// pool is opened by `kubuno_db::connect`.
pub use kubuno_db::DbSettings as DatabaseSettings;

#[derive(Debug, Clone, Deserialize)]
pub struct TileServerSettings {
    pub url:       String,
    pub style_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NominatimSettings {
    pub url:             String,
    pub accept_language: String,
    pub rate_limit_rps:  u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsrmSettings {
    // URL OSRM de repli (instance auto-hébergée mono-profil, profil dans le path).
    pub url:      String,
    pub profiles: Vec<String>,
    // Surcharges par profil. Par défaut → instances OSRM publiques FOSSGIS
    // (routing.openstreetmap.de), gratuites et sans clé, pour que le routage
    // fonctionne d'emblée en streaming. Pour un usage intensif, héberger son
    // propre OSRM et renseigner `osrm.url` (ou ces clés) dans config.toml.
    pub url_driving: Option<String>,
    pub url_cycling: Option<String>,
    pub url_foot:    Option<String>,
}

impl OsrmSettings {
    /// URL de base OSRM à utiliser pour un profil donné (surcharge par profil,
    /// sinon `url` de repli).
    pub fn url_for(&self, profile: &str) -> &str {
        match profile {
            "driving" => self.url_driving.as_deref().unwrap_or(&self.url),
            "cycling" => self.url_cycling.as_deref().unwrap_or(&self.url),
            "foot"    => self.url_foot.as_deref().unwrap_or(&self.url),
            _          => &self.url,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct OverpassSettings {
    pub url:          String,
    pub timeout_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MapsSettings {
    pub default_lat:     f64,
    pub default_lng:     f64,
    pub default_zoom:    u32,
    pub max_gpx_size_mb: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingSettings {
    pub level:  String,
    pub format: LogFormat,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Pretty,
    Json,
}

impl Settings {
    pub fn load() -> Result<Self, ConfigError> {
        let mut builder = Config::builder()
            .set_default("server.host", "127.0.0.1")?
            .set_default("server.port", 3115)?
            .set_default("core.url", "http://127.0.0.1:8080")?
            .set_default("core.internal_secret", "")?
            .set_default("database.max_connections", 10u64)?
            .set_default("database.min_connections", 1u64)?
            .set_default("database.connect_timeout", 10u64)?
            .set_default("database.run_migrations", true)?
            .set_default("database.engine", "postgres")?
            // SQLite only: where `<schema>.sqlite` lives.
            .set_default("database.path", "./data/db")?
            .set_default("storage.backend", "local")?
            .set_default("storage.local_path", "./data/files")?
            .set_default("storage.temp_path", "./data/temp")?
            .set_default("tile_server.url", "http://localhost:3000")?
            .set_default("tile_server.style_url", "http://localhost:3000/style.json")?
            .set_default("nominatim.url", "https://nominatim.openstreetmap.org")?
            .set_default("nominatim.accept_language", "fr,en")?
            .set_default("nominatim.rate_limit_rps", 1u64)?
            .set_default("osrm.url", "http://localhost:5000")?
            .set_default("osrm.profiles", vec!["driving", "cycling", "foot"])?
            // Défauts publics FOSSGIS (gratuits, sans clé, streaming) — routage
            // opérationnel d'emblée pour voiture / vélo / pieds.
            .set_default("osrm.url_driving", "https://routing.openstreetmap.de/routed-car")?
            .set_default("osrm.url_cycling", "https://routing.openstreetmap.de/routed-bike")?
            .set_default("osrm.url_foot",    "https://routing.openstreetmap.de/routed-foot")?
            .set_default("overpass.url", "https://overpass-api.de/api/interpreter")?
            .set_default("overpass.timeout_secs", 10u64)?
            .set_default("maps.default_lat", 48.8566f64)?
            .set_default("maps.default_lng", 2.3522f64)?
            .set_default("maps.default_zoom", 12u64)?
            .set_default("maps.max_gpx_size_mb", 10u64)?
            .set_default("logging.level", "info")?
            .set_default("logging.format", "pretty")?;

        if let Ok(path) = std::env::var("KM_CONFIG_FILE") {
            builder = builder.add_source(File::with_name(&path).required(true));
        } else {
            builder = builder.add_source(File::with_name("config").required(false));
        }

        builder = builder
            .set_override_option("database.host",     std::env::var("KUBUNO_DB_HOST").ok())?
            .set_override_option("database.port",     std::env::var("KUBUNO_DB_PORT").ok()
                                                        .and_then(|v| v.parse::<u64>().ok().map(|n| n.to_string())))?
            .set_override_option("database.user",     std::env::var("KUBUNO_DB_USER").ok())?
            .set_override_option("database.password", std::env::var("KUBUNO_DB_PASSWORD").ok())?
            .set_override_option("database.database", std::env::var("KUBUNO_DB_NAME").ok())?
            .set_override_option("database.path",     std::env::var("KUBUNO_DB_PATH").ok())?
            .set_override_option("database.engine",   std::env::var("KUBUNO_DB_ENGINE").ok())?
            .set_override_option("core.internal_secret", std::env::var("KUBUNO_INTERNAL_SECRET").ok())?
            .set_override_option("core.url",          std::env::var("KUBUNO_CORE_URL").ok())?;

        builder = builder.add_source(
            Environment::with_prefix("KM")
                .separator("__")
                .try_parsing(true),
        );

        builder.build()?.try_deserialize()
    }
}
