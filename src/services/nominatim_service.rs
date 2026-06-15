use serde::{Deserialize, Serialize};

use crate::errors::{MapsError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NominatimResult {
    pub place_id:     Option<u64>,
    pub osm_type:     Option<String>,
    pub osm_id:       Option<u64>,
    pub display_name: String,
    pub lat:          String,
    pub lon:          String,
    pub category:     Option<String>,
    #[serde(rename = "type")]
    pub place_type:   Option<String>,
    pub importance:   Option<f64>,
    pub address:      Option<serde_json::Value>,
    pub boundingbox:  Option<Vec<String>>,
    pub extratags:    Option<serde_json::Value>,
    pub namedetails:  Option<serde_json::Value>,
}

pub struct NominatimService {
    pub client:   reqwest::Client,
    pub base_url: String,
    pub language: String,
}

impl NominatimService {
    pub fn new(client: reqwest::Client, base_url: String, language: String) -> Self {
        Self { client, base_url, language }
    }

    pub async fn search(
        &self,
        query:  &str,
        limit:  u32,
        bounds: Option<[f64; 4]>,
        lang:   Option<&str>,
    ) -> Result<Vec<NominatimResult>> {
        let mut params: Vec<(&str, String)> = vec![
            ("q",               query.to_string()),
            ("format",          "jsonv2".to_string()),
            ("limit",           limit.to_string()),
            ("addressdetails",  "1".to_string()),
            ("extratags",       "1".to_string()),
            ("namedetails",     "1".to_string()),
            ("accept-language", lang.unwrap_or(&self.language).to_string()),
        ];

        if let Some(b) = bounds {
            params.push(("viewbox", format!("{},{},{},{}", b[1], b[0], b[3], b[2])));
            params.push(("bounded", "0".to_string()));
        }

        self.client
            .get(format!("{}/search", self.base_url))
            .query(&params)
            .header("User-Agent", "KubunoMaps/0.1 (self-hosted)")
            .send()
            .await
            .map_err(|_| MapsError::NominatimUnavailable)?
            .json::<Vec<NominatimResult>>()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("Nominatim parse: {e}")))
    }

    pub async fn reverse(&self, lat: f64, lng: f64, zoom: u8) -> Result<NominatimResult> {
        self.client
            .get(format!("{}/reverse", self.base_url))
            .query(&[
                ("lat",             lat.to_string()),
                ("lon",             lng.to_string()),
                ("zoom",            zoom.to_string()),
                ("format",          "jsonv2".to_string()),
                ("addressdetails",  "1".to_string()),
                ("accept-language", self.language.clone()),
            ])
            .header("User-Agent", "KubunoMaps/0.1 (self-hosted)")
            .send()
            .await
            .map_err(|_| MapsError::NominatimUnavailable)?
            .json()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("Nominatim reverse parse: {e}")))
    }

    pub async fn lookup(&self, osm_ids: Vec<(String, u64)>) -> Result<Vec<NominatimResult>> {
        let osm_str = osm_ids.iter()
            .map(|(t, id)| format!("{}{}", t.to_uppercase(), id))
            .collect::<Vec<_>>()
            .join(",");

        self.client
            .get(format!("{}/lookup", self.base_url))
            .query(&[
                ("osm_ids",         osm_str),
                ("format",          "jsonv2".to_string()),
                ("addressdetails",  "1".to_string()),
                ("extratags",       "1".to_string()),
                ("accept-language", self.language.clone()),
            ])
            .header("User-Agent", "KubunoMaps/0.1 (self-hosted)")
            .send()
            .await
            .map_err(|_| MapsError::NominatimUnavailable)?
            .json::<Vec<NominatimResult>>()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("Nominatim lookup parse: {e}")))
    }
}
