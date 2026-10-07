use serde::{Deserialize, Serialize};

use crate::errors::{MapsError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsrmResponse {
    pub code:    String,
    /// Human-readable detail sent along with a non-`Ok` code.
    pub message: Option<String>,
    pub routes:  Option<Vec<OsrmRouteRaw>>,
}

impl OsrmResponse {
    /// True when OSRM rejected the request because the server was not built
    /// with the requested `exclude=` class combination (the public FOSSGIS
    /// instances answer `InvalidValue` with this message).
    pub fn is_exclude_unsupported(&self) -> bool {
        self.code != "Ok"
            && self
                .message
                .as_deref()
                .map(|m| m.contains("Exclude flag combination is not supported"))
                .unwrap_or(false)
    }
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
        steps:        bool,
        exclude:      &[String],
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

        let mut query: Vec<(&str, String)> = vec![
            ("alternatives", if alternatives { "true" } else { "false" }.to_string()),
            ("geometries", "geojson".to_string()),
            ("overview", "full".to_string()),
            ("steps", if steps { "true" } else { "false" }.to_string()),
        ];
        // OSRM takes a comma-separated list of classes to avoid.
        if !exclude.is_empty() {
            query.push(("exclude", exclude.join(",")));
        }

        self.client
            .get(&url)
            .query(&query)
            .send()
            .await
            .map_err(|_| MapsError::OsrmUnavailable)?
            .json::<OsrmResponse>()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("OSRM parse: {e}")))
    }
}
