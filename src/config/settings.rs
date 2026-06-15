use anyhow::Context;
use config::{Config, ConfigError, Environment, File};
use kubuno_storage::StorageConfig;
use serde::Deserialize;
use std::time::Duration;

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
    pub logging:     LoggingSettings,
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

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseSettings {
    pub url:             Option<String>,
    pub host:            Option<String>,
    pub port:            Option<u16>,
    pub user:            Option<String>,
    pub password:        Option<String>,
    pub database:        Option<String>,
    pub max_connections: u32,
    pub min_connections: u32,
    #[serde(with = "duration_secs")]
    pub connect_timeout: Duration,
    pub run_migrations:  bool,
}

impl DatabaseSettings {
    pub fn connect_options(&self) -> anyhow::Result<sqlx::postgres::PgConnectOptions> {
        use std::str::FromStr;
        if self.host.is_some() || self.user.is_some() {
            let user     = self.user.as_deref().context("database.user requis")?;
            let password = self.password.as_deref().context("database.password requis")?;
            let database = self.database.as_deref().context("database.database requis")?;
            return Ok(sqlx::postgres::PgConnectOptions::new()
                .host(self.host.as_deref().unwrap_or("localhost"))
                .port(self.port.unwrap_or(5432))
                .username(user)
                .password(password)
                .database(database));
        }
        if let Some(url) = &self.url {
            return sqlx::postgres::PgConnectOptions::from_str(url)
                .context("database.url invalide");
        }
        Err(anyhow::anyhow!("database : fournissez les champs host/user/password/database"))
    }
}

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

mod duration_secs {
    use serde::Deserialize;
    use std::time::Duration;

    pub fn deserialize<'de, D>(d: D) -> Result<Duration, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let secs = u64::deserialize(d)?;
        Ok(Duration::from_secs(secs))
    }
}
