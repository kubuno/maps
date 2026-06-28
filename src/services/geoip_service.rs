//! Offline IP→location resolution. The admin supplies a MaxMind-format `.mmdb`
//! (GeoLite2 or the free DB-IP / IPinfo databases); without one, geo is simply
//! off and every lookup is `unavailable`. Maps owns this service so other modules
//! (e.g. p2pnas) consume it over the API instead of each shipping a database.

use maxminddb::{geoip2, Reader};
use serde::Serialize;

pub struct GeoResolver {
    reader: Reader<Vec<u8>>,
}

/// A resolved location. `country` is the ISO code; `lat`/`lng` are only present
/// when a City-level database is loaded (a Country database gives just the code).
#[derive(Debug, Clone, Serialize, Default)]
pub struct GeoLocation {
    pub country: Option<String>,
    pub city:    Option<String>,
    pub lat:     Option<f64>,
    pub lng:     Option<f64>,
}

impl GeoResolver {
    /// Open a `.mmdb`; None (with a warning) if it can't be read.
    pub fn open(path: &str) -> Option<Self> {
        match Reader::open_readfile(path) {
            Ok(reader) => {
                tracing::info!(path, "GeoIP database loaded — /geoip service enabled");
                Some(GeoResolver { reader })
            }
            Err(e) => {
                tracing::warn!(path, error = %e, "GeoIP database load failed — geo service disabled");
                None
            }
        }
    }

    /// Resolve an IP. Tries a City record first (country + coordinates), then a
    /// Country record. Returns an empty location if the IP isn't found.
    pub fn locate(&self, ip: &str) -> Option<GeoLocation> {
        let ip: std::net::IpAddr = ip.parse().ok()?;
        if let Ok(city) = self.reader.lookup::<geoip2::City>(ip) {
            return Some(GeoLocation {
                country: city.country.and_then(|c| c.iso_code).map(str::to_string),
                city:    city.city.and_then(|c| c.names).and_then(|n| n.get("en").map(|s| s.to_string())),
                lat:     city.location.as_ref().and_then(|l| l.latitude),
                lng:     city.location.as_ref().and_then(|l| l.longitude),
            });
        }
        let country: geoip2::Country = self.reader.lookup(ip).ok()?;
        Some(GeoLocation {
            country: country.country.and_then(|c| c.iso_code).map(str::to_string),
            ..Default::default()
        })
    }
}
