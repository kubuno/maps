//! Instance-wide settings of the maps module, as the administrator left them in
//! the console.
//!
//! Declared by `module.toml`'s `[[settings]]` blocks, stored in `core.settings`,
//! and read back here through `/internal/modules/maps/settings` — a module owns
//! its own schema and cannot read the core's tables, and a background refresher
//! has no user token for the public config route. The module is named in the URL
//! (not derived from the secret) so the read works whether the instance shares
//! one master secret between modules or issues a derived one per module.
//!
//! These promote to the admin console the provider endpoints and map defaults
//! that used to live only in `config.toml`. Every field is read by code that
//! acts on it (see the consumption points in `handlers/` and `router`): a knob
//! that changes nothing is worse than an absent one.
//!
//! Resolution rule at the consumption points: the instance value wins only when
//! the admin changed it from the compiled default; left untouched it falls back
//! to `config.toml`, so an install that configured these endpoints the old way
//! keeps working unchanged until an admin edits them in the console.

use serde_json::Value;

#[derive(Debug, Clone)]
pub struct InstanceConfig {
    /// Base URL of the tile server (`{url}/{source}/{z}/{x}/{y}`).
    pub tile_url: String,
    /// URL of the MapLibre `style.json` handed to the client.
    pub tile_style_url: String,
    /// Base URL of the Nominatim geocoding service.
    pub nominatim_url: String,
    /// `Accept-Language` sent to Nominatim (e.g. `fr,en`).
    pub nominatim_lang: String,
    /// Base URL of the OSRM routing service. An admin override here takes
    /// precedence over the per-profile `config.toml` URLs for every profile.
    pub osrm_url: String,
    /// Base URL of the Overpass API used for POI lookups.
    pub overpass_url: String,
    /// Overpass query timeout, in seconds.
    pub overpass_timeout_secs: u64,
    /// Latitude the map opens on when the client has no saved position.
    pub default_lat: f64,
    /// Longitude the map opens on when the client has no saved position.
    pub default_lng: f64,
    /// Zoom level the map opens on.
    pub default_zoom: u32,
    /// Ceiling on an uploaded GPX file, in megabytes.
    pub max_gpx_size_mb: u64,
    /// Whether POI lookups (Overpass) are available on this instance. When off,
    /// the `/overpass/*` routes answer `Forbidden` for every user.
    pub enable_overpass: bool,
    /// Policy for anonymous share links on sketches. See `SketchSharing`.
    pub sketch_sharing: SketchSharing,
    /// Ceiling on the number of saved places a single user may keep.
    /// `0` means "no limit", which is the shipped behaviour.
    pub max_places_per_user: u64,
    /// Ceiling on the number of GPX traces a single user may keep.
    /// `0` means "no limit", which is the shipped behaviour.
    pub max_gpx_per_user: u64,
}

/// How far an anonymous share link on a sketch is allowed to go.
///
/// A sketch shared publicly is readable by anyone holding the token, WITHOUT a
/// session — the one surface of this module that leaves the instance. Turning a
/// sharing policy off must not silently rewrite what users already published, so
/// the middle state separates "stop publishing" from "revoke what is published":
/// an administrator tightening the policy usually wants the first, and only
/// sometimes the second.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SketchSharing {
    /// New public links may be created (shipped behaviour).
    On,
    /// No NEW public link may be created; links already handed out keep working.
    ExistingOnly,
    /// No new link, and every existing link stops resolving.
    Off,
}

impl SketchSharing {
    /// Parses the console's `enum` value. An unknown string keeps the permissive
    /// shipped behaviour rather than locking an instance out of a feature it was
    /// using, because an unreadable value means "the admin never chose", not
    /// "the admin said no".
    fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "on"            => Some(Self::On),
            "existing_only" => Some(Self::ExistingOnly),
            "off"           => Some(Self::Off),
            _               => None,
        }
    }

    /// Whether a user may turn a sketch into a public link right now.
    pub fn allows_new_link(self) -> bool {
        matches!(self, Self::On)
    }

    /// Whether an already-issued token must still resolve.
    pub fn allows_existing_link(self) -> bool {
        matches!(self, Self::On | Self::ExistingOnly)
    }
}

impl Default for InstanceConfig {
    /// The compiled defaults, kept identical to `config/settings.rs` so that an
    /// unset setting (or a failed read of the core) resolves back to exactly the
    /// value the module shipped with.
    fn default() -> Self {
        Self {
            tile_url:              "http://localhost:3000".to_string(),
            tile_style_url:        "http://localhost:3000/style.json".to_string(),
            nominatim_url:         "https://nominatim.openstreetmap.org".to_string(),
            nominatim_lang:        "fr,en".to_string(),
            osrm_url:              "http://localhost:5000".to_string(),
            overpass_url:          "https://overpass-api.de/api/interpreter".to_string(),
            overpass_timeout_secs: 10,
            default_lat:           48.8566,
            default_lng:           2.3522,
            default_zoom:          12,
            max_gpx_size_mb:       10,
            enable_overpass:       true,
            sketch_sharing:        SketchSharing::On,
            max_places_per_user:   0, // no limit
            max_gpx_per_user:      0, // no limit
        }
    }
}

impl InstanceConfig {
    /// Maps the core's `{key: value}` object onto the struct. Every read falls
    /// back to the compiled default rather than to a permissive value: a payload
    /// missing a key (an older core, a cleared field) must not silently change a
    /// default, and an out-of-range number is treated as a mistake the same way.
    pub fn from_settings(settings: &Value) -> Self {
        let d = Self::default();
        // A URL / free-text value: kept only when present and non-empty, so an
        // absent or cleared key falls back to the compiled default rather than
        // blanking the endpoint.
        let str_of = |key: &str, fallback: String| -> String {
            settings
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or(fallback)
        };
        // An integer in a range. The console stores an `int` as a JSON number,
        // but a value echoed from a text field can arrive as a string — accept
        // both, then range-check.
        let uint_in = |key: &str, min: u64, max: u64, fallback: u64| -> u64 {
            let v = settings.get(key);
            v.and_then(Value::as_u64)
                .or_else(|| v.and_then(Value::as_str).and_then(|s| s.trim().parse::<u64>().ok()))
                .filter(|n| (min..=max).contains(n))
                .unwrap_or(fallback)
        };
        // A coordinate. The core has no float value type, so latitude/longitude
        // are declared as text and parsed here; a number sent through the API is
        // accepted too. Out-of-range keeps the default.
        let coord = |key: &str, min: f64, max: f64, fallback: f64| -> f64 {
            let v = settings.get(key);
            v.and_then(Value::as_f64)
                .or_else(|| v.and_then(Value::as_str).and_then(|s| s.trim().parse::<f64>().ok()))
                .filter(|n| (min..=max).contains(n))
                .unwrap_or(fallback)
        };
        Self {
            tile_url:              str_of("tile_url", d.tile_url),
            tile_style_url:        str_of("tile_style_url", d.tile_style_url),
            nominatim_url:         str_of("nominatim_url", d.nominatim_url),
            nominatim_lang:        str_of("nominatim_lang", d.nominatim_lang),
            osrm_url:              str_of("osrm_url", d.osrm_url),
            overpass_url:          str_of("overpass_url", d.overpass_url),
            overpass_timeout_secs: uint_in("overpass_timeout_secs", 1, 120, d.overpass_timeout_secs),
            default_lat:           coord("default_lat", -90.0, 90.0, d.default_lat),
            default_lng:           coord("default_lng", -180.0, 180.0, d.default_lng),
            default_zoom:          uint_in("default_zoom", 0, 22, d.default_zoom as u64) as u32,
            max_gpx_size_mb:       uint_in("max_gpx_size_mb", 1, 500, d.max_gpx_size_mb),
            enable_overpass:       settings
                .get("enable_overpass")
                .and_then(Value::as_bool)
                .unwrap_or(d.enable_overpass),
            sketch_sharing:        settings
                .get("sketch_sharing")
                .and_then(Value::as_str)
                .and_then(SketchSharing::parse)
                .unwrap_or(d.sketch_sharing),
            // A quota of 0 means "no limit", so 0 is a legal value here and the
            // range starts at it. The upper bound only guards against a typo
            // turning into an effectively-unbounded number.
            max_places_per_user:   uint_in("max_places_per_user", 0, 1_000_000, d.max_places_per_user),
            max_gpx_per_user:      uint_in("max_gpx_per_user", 0, 1_000_000, d.max_gpx_per_user),
        }
    }
}

/// Reads the instance settings from the core. Any failure yields `None`, so the
/// caller keeps the values it already had rather than reverting to defaults
/// because the core was briefly unreachable.
pub async fn fetch(http: &reqwest::Client, core_url: &str, secret: &str) -> Option<InstanceConfig> {
    let url = format!("{core_url}/internal/modules/maps/settings");
    let resp = http
        .get(&url)
        .header("X-Internal-Secret", secret)
        .send()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Lecture des réglages d'instance maps"))
        .ok()?;

    if !resp.status().is_success() {
        tracing::warn!(status = %resp.status(), "Réglages d'instance maps refusés par le core");
        return None;
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Réglages d'instance maps : réponse illisible"))
        .ok()?;

    Some(InstanceConfig::from_settings(body.get("settings")?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_keys_keep_the_compiled_defaults() {
        let c = InstanceConfig::from_settings(&json!({}));
        let d = InstanceConfig::default();
        assert_eq!(c.tile_url, d.tile_url);
        assert_eq!(c.nominatim_lang, d.nominatim_lang);
        assert_eq!(c.overpass_timeout_secs, d.overpass_timeout_secs);
        assert_eq!(c.default_lat, d.default_lat);
        assert_eq!(c.default_zoom, d.default_zoom);
        assert_eq!(c.max_gpx_size_mb, d.max_gpx_size_mb);
    }

    #[test]
    fn values_are_read() {
        let c = InstanceConfig::from_settings(&json!({
            "tile_url":              "https://tiles.example.org",
            "nominatim_url":         "https://nom.example.org",
            "overpass_timeout_secs": 25,
            "default_lat":           "40.7128",
            "default_lng":           "-74.0060",
            "default_zoom":          8,
            "max_gpx_size_mb":       50,
        }));
        assert_eq!(c.tile_url, "https://tiles.example.org");
        assert_eq!(c.nominatim_url, "https://nom.example.org");
        assert_eq!(c.overpass_timeout_secs, 25);
        assert!((c.default_lat - 40.7128).abs() < 1e-9);
        assert!((c.default_lng + 74.0060).abs() < 1e-9);
        assert_eq!(c.default_zoom, 8);
        assert_eq!(c.max_gpx_size_mb, 50);
    }

    #[test]
    fn empty_url_and_out_of_range_fall_back() {
        let c = InstanceConfig::from_settings(&json!({
            "tile_url":     "   ",
            "default_lat":  "999",
            "default_zoom": 999,
        }));
        let d = InstanceConfig::default();
        assert_eq!(c.tile_url, d.tile_url);
        assert_eq!(c.default_lat, d.default_lat);
        assert_eq!(c.default_zoom, d.default_zoom);
    }

    #[test]
    fn sharing_policy_is_read_and_graded() {
        let on = InstanceConfig::from_settings(&json!({ "sketch_sharing": "on" }));
        assert!(on.sketch_sharing.allows_new_link());
        assert!(on.sketch_sharing.allows_existing_link());

        let existing = InstanceConfig::from_settings(&json!({ "sketch_sharing": "existing_only" }));
        assert!(!existing.sketch_sharing.allows_new_link());
        assert!(existing.sketch_sharing.allows_existing_link());

        let off = InstanceConfig::from_settings(&json!({ "sketch_sharing": "off" }));
        assert!(!off.sketch_sharing.allows_new_link());
        assert!(!off.sketch_sharing.allows_existing_link());
    }

    #[test]
    fn unknown_sharing_policy_keeps_the_shipped_behaviour() {
        let c = InstanceConfig::from_settings(&json!({ "sketch_sharing": "nonsense" }));
        assert_eq!(c.sketch_sharing, SketchSharing::On);
    }

    #[test]
    fn feature_flag_and_quotas_are_read() {
        let c = InstanceConfig::from_settings(&json!({
            "enable_overpass":     false,
            "max_places_per_user": 200,
            "max_gpx_per_user":    50,
        }));
        assert!(!c.enable_overpass);
        assert_eq!(c.max_places_per_user, 200);
        assert_eq!(c.max_gpx_per_user, 50);
    }

    #[test]
    fn zero_quota_means_no_limit_and_is_accepted() {
        let c = InstanceConfig::from_settings(&json!({ "max_places_per_user": 0 }));
        assert_eq!(c.max_places_per_user, 0);
    }
}
