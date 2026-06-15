use serde::{Deserialize, Serialize};

use crate::errors::{MapsError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsrmResponse {
    pub code:   String,
    pub routes: Option<Vec<OsrmRouteRaw>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsrmRouteRaw {
    pub duration:  f64,
    pub distance:  f64,
    pub geometry:  serde_json::Value,
    pub legs:      Vec<serde_json::Value>,
    pub weight:    Option<f64>,
    pub weight_name: Option<String>,
}

pub struct OsrmService {
    pub client:   reqwest::Client,
    pub base_url: String,
}

impl OsrmService {
    pub fn new(client: reqwest::Client, base_url: String) -> Self {
        Self { client, base_url }
    }

    pub async fn route(
        &self,
        waypoints:    &[[f64; 2]],
        profile:      &str,
        alternatives: bool,
    ) -> Result<OsrmResponse> {
        if waypoints.len() < 2 {
            return Err(MapsError::Validation("Au moins 2 points requis".into()));
        }

        let coords = waypoints
            .iter()
            .map(|p| format!("{},{}", p[1], p[0]))
            .collect::<Vec<_>>()
            .join(";");

        let url = format!("{}/route/v1/{}/{}", self.base_url, profile, coords);

        self.client
            .get(&url)
            .query(&[
                ("alternatives", if alternatives { "true" } else { "false" }),
                ("geometries", "geojson"),
                ("overview", "full"),
                ("steps", "false"),
            ])
            .send()
            .await
            .map_err(|_| MapsError::OsrmUnavailable)?
            .json::<OsrmResponse>()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("OSRM parse: {e}")))
    }
}
