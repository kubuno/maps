//! Service Overpass — recherche de POI (« qu'y a-t-il autour de moi ») par
//! catégorie autour d'un point ou dans une emprise. Utilise l'API Overpass
//! (déjà configurée dans `settings.overpass`) via une requête Overpass QL.

use serde::{Deserialize, Serialize};

use crate::errors::{MapsError, Result};

/// Catégorie de POI : identifiant stable + emoji + filtres OSM (OR entre eux).
pub struct PoiCategory {
    pub id:      &'static str,
    pub icon:    &'static str,
    /// Filtres OSM `(clé, valeur)`. Plusieurs filtres = union (OR).
    pub filters: &'static [(&'static str, &'static str)],
}

/// Catalogue de catégories exposé au frontend (les chips « Restaurants »,
/// « Hôtels »… ) et utilisé pour construire la requête Overpass.
pub const CATEGORIES: &[PoiCategory] = &[
    PoiCategory { id: "restaurant",  icon: "🍽️", filters: &[("amenity", "restaurant")] },
    PoiCategory { id: "cafe",        icon: "☕",  filters: &[("amenity", "cafe")] },
    PoiCategory { id: "fast_food",   icon: "🍔",  filters: &[("amenity", "fast_food")] },
    PoiCategory { id: "bar",         icon: "🍺",  filters: &[("amenity", "bar"), ("amenity", "pub")] },
    PoiCategory { id: "bakery",      icon: "🥐",  filters: &[("shop", "bakery")] },
    PoiCategory { id: "hotel",       icon: "🏨",  filters: &[("tourism", "hotel"), ("tourism", "hostel"), ("tourism", "guest_house")] },
    PoiCategory { id: "supermarket", icon: "🛒",  filters: &[("shop", "supermarket"), ("shop", "convenience")] },
    PoiCategory { id: "pharmacy",    icon: "💊",  filters: &[("amenity", "pharmacy")] },
    PoiCategory { id: "hospital",    icon: "🏥",  filters: &[("amenity", "hospital"), ("amenity", "clinic")] },
    PoiCategory { id: "doctor",      icon: "🩺",  filters: &[("amenity", "doctors")] },
    PoiCategory { id: "atm",         icon: "🏧",  filters: &[("amenity", "atm")] },
    PoiCategory { id: "bank",        icon: "🏦",  filters: &[("amenity", "bank")] },
    PoiCategory { id: "fuel",        icon: "⛽",  filters: &[("amenity", "fuel")] },
    PoiCategory { id: "charging",    icon: "🔌",  filters: &[("amenity", "charging_station")] },
    PoiCategory { id: "parking",     icon: "🅿️", filters: &[("amenity", "parking")] },
    PoiCategory { id: "museum",      icon: "🏛️", filters: &[("tourism", "museum"), ("tourism", "gallery")] },
    PoiCategory { id: "attraction",  icon: "📸",  filters: &[("tourism", "attraction"), ("tourism", "viewpoint")] },
    PoiCategory { id: "park",        icon: "🌳",  filters: &[("leisure", "park"), ("leisure", "garden")] },
    PoiCategory { id: "playground",  icon: "🛝",  filters: &[("leisure", "playground")] },
    PoiCategory { id: "sport",       icon: "🏟️", filters: &[("leisure", "sports_centre"), ("leisure", "fitness_centre"), ("leisure", "pitch")] },
    PoiCategory { id: "cinema",      icon: "🎬",  filters: &[("amenity", "cinema")] },
    PoiCategory { id: "theatre",     icon: "🎭",  filters: &[("amenity", "theatre")] },
    PoiCategory { id: "school",      icon: "🏫",  filters: &[("amenity", "school"), ("amenity", "university"), ("amenity", "college")] },
    PoiCategory { id: "library",     icon: "📚",  filters: &[("amenity", "library")] },
    PoiCategory { id: "post",        icon: "✉️",  filters: &[("amenity", "post_office")] },
    PoiCategory { id: "police",      icon: "🚓",  filters: &[("amenity", "police")] },
    PoiCategory { id: "toilets",     icon: "🚻",  filters: &[("amenity", "toilets")] },
    PoiCategory { id: "drinking_water", icon: "🚰", filters: &[("amenity", "drinking_water"), ("amenity", "water_point")] },
    PoiCategory { id: "transit",     icon: "🚏",  filters: &[("highway", "bus_stop"), ("railway", "station"), ("railway", "tram_stop"), ("amenity", "bus_station")] },
    PoiCategory { id: "bicycle",     icon: "🚲",  filters: &[("amenity", "bicycle_rental"), ("shop", "bicycle")] },
    PoiCategory { id: "place_of_worship", icon: "⛪", filters: &[("amenity", "place_of_worship")] },
    PoiCategory { id: "viewpoint",   icon: "🌄",  filters: &[("tourism", "viewpoint")] },
];

pub fn category(id: &str) -> Option<&'static PoiCategory> {
    CATEGORIES.iter().find(|c| c.id == id)
}

/// Un POI résolu et normalisé pour le frontend.
#[derive(Debug, Clone, Serialize)]
pub struct Poi {
    pub osm_type: String,
    pub osm_id:   i64,
    pub lat:      f64,
    pub lng:      f64,
    pub name:     Option<String>,
    /// Catégorie déduite (id du catalogue) + emoji.
    pub category: Option<String>,
    pub icon:     Option<String>,
    pub tags:     serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct OverpassResponse {
    elements: Vec<OverpassElement>,
}

#[derive(Debug, Deserialize)]
struct OverpassElement {
    #[serde(rename = "type")]
    el_type: String,
    id:      i64,
    lat:     Option<f64>,
    lon:     Option<f64>,
    center:  Option<OverpassCenter>,
    tags:    Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct OverpassCenter {
    lat: f64,
    lon: f64,
}

pub struct OverpassService {
    pub client:       reqwest::Client,
    pub base_url:     String,
    pub timeout_secs: u64,
}

impl OverpassService {
    pub fn new(client: reqwest::Client, base_url: String, timeout_secs: u64) -> Self {
        Self { client, base_url, timeout_secs }
    }

    /// POI autour d'un point (rayon en mètres) pour une ou plusieurs catégories.
    pub async fn nearby(
        &self,
        lat:          f64,
        lng:          f64,
        radius_m:     u32,
        category_ids: &[String],
        limit:        u32,
    ) -> Result<Vec<Poi>> {
        // Garde-fous : rayon ≤ 10 km, limite ≤ 300, ≥ 1 catégorie valide.
        let radius = radius_m.clamp(1, 10_000);
        let limit  = limit.clamp(1, 300);

        let mut body_filters = String::new();
        for cid in category_ids {
            if let Some(cat) = category(cid) {
                for (k, v) in cat.filters {
                    body_filters.push_str(&format!(
                        "  nwr(around:{radius},{lat},{lng})[\"{k}\"=\"{v}\"];\n"
                    ));
                }
            }
        }
        if body_filters.is_empty() {
            return Ok(vec![]);
        }

        let ql = format!(
            "[out:json][timeout:{}];\n(\n{}\n);\nout center tags {};",
            self.timeout_secs, body_filters, limit
        );

        let resp: OverpassResponse = self
            .client
            .post(&self.base_url)
            .body(ql)
            .header("User-Agent", "KubunoMaps/0.1 (self-hosted)")
            .send()
            .await
            .map_err(|_| MapsError::OverpassUnavailable)?
            .json()
            .await
            .map_err(|e| MapsError::Internal(anyhow::anyhow!("Overpass parse: {e}")))?;

        let mut out = Vec::with_capacity(resp.elements.len());
        for el in resp.elements {
            let (lat, lng) = match (el.lat, el.lon, &el.center) {
                (Some(la), Some(lo), _) => (la, lo),
                (_, _, Some(c))         => (c.lat, c.lon),
                _ => continue,
            };
            let tags = el.tags.unwrap_or_default();
            let name = tags.get("name").and_then(|v| v.as_str()).map(str::to_string);
            let (cat_id, icon) = best_category(&tags);
            out.push(Poi {
                osm_type: el.el_type,
                osm_id:   el.id,
                lat,
                lng,
                name,
                category: cat_id,
                icon,
                tags,
            });
        }
        Ok(out)
    }
}

/// Déduit la catégorie (et l'emoji) d'un POI à partir de ses tags OSM, en
/// prenant la première catégorie du catalogue dont un filtre correspond.
fn best_category(tags: &serde_json::Map<String, serde_json::Value>) -> (Option<String>, Option<String>) {
    for cat in CATEGORIES {
        for (k, v) in cat.filters {
            if tags.get(*k).and_then(|x| x.as_str()) == Some(*v) {
                return (Some(cat.id.to_string()), Some(cat.icon.to_string()));
            }
        }
    }
    (None, None)
}
