//! Search and saved places — the web's search bar (`MapsSearchBar` / `geocoding.ts`) and saved places
//! (`useSavedPlaces`), for the native app.
//!
//! A [`PlacesBackend`] answers the window: [`LiveBackend`] talks to the Maps server of the signed-in account through
//! the Kubuno desktop shell's token broker (`kubuno_desktop_sync`; the app never holds a password), with the very
//! endpoints the web uses — `GET /api/v1/maps/geocode/search` (the server's Nominatim proxy, which also records the
//! search history), `GET`/`POST`/`DELETE /api/v1/maps/places`. [`SampleBackend`] serves the offline sample
//! (`--sample`) without any server. Calls block: the window runs them on a worker thread.

use std::sync::{Arc, Mutex};

use kubuno_maps_core::geo::LngLat;
use serde::Deserialize;

const MAPS_PREFIX: &str = "/api/v1/maps";

/// A search result.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchHit {
    /// The short name (the first part of the full address).
    pub name: String,
    /// The rest of the address, for the second line.
    pub detail: String,
    pub location: LngLat,
    /// The OSM category / type (`amenity`, `restaurant`…), when known.
    pub category: Option<String>,
    pub osm_type: Option<String>,
    pub osm_id: Option<i64>,
}

/// A saved place.
#[derive(Debug, Clone, PartialEq)]
pub struct Place {
    /// The server id (`None` for a sample place).
    pub id: Option<String>,
    pub name: String,
    pub address: Option<String>,
    pub category: Option<String>,
    pub location: LngLat,
}

/// What the window asks of the places service.
pub trait PlacesBackend: Send + Sync {
    /// Search `query`, preferably within `bounds` (`[south, west, north, east]`), names in `lang`.
    fn search(&self, query: &str, bounds: Option<[f64; 4]>, lang: &str) -> Result<Vec<SearchHit>, String>;
    /// The account's saved places.
    fn saved(&self) -> Result<Vec<Place>, String>;
    /// Save a search result as a place.
    fn save(&self, hit: &SearchHit) -> Result<Place, String>;
    /// Forget a saved place.
    fn delete(&self, place: &Place) -> Result<(), String>;
}

/// Percent-encode a query value (the unreserved set stays).
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Split a full address into the short name and the rest.
fn split_name(display: &str) -> (String, String) {
    match display.split_once(',') {
        Some((head, rest)) => (head.trim().to_string(), rest.trim().to_string()),
        None => (display.trim().to_string(), String::new()),
    }
}

#[derive(Deserialize)]
struct RawHit {
    display_name: String,
    lat: String,
    lon: String,
    category: Option<String>,
    #[serde(rename = "type")]
    place_type: Option<String>,
    osm_type: Option<String>,
    osm_id: Option<i64>,
}

#[derive(Deserialize)]
struct RawPlace {
    id: String,
    name: String,
    address: Option<String>,
    category: Option<String>,
    lat: f64,
    lng: f64,
}

impl From<RawPlace> for Place {
    fn from(p: RawPlace) -> Self {
        Place { id: Some(p.id), name: p.name, address: p.address, category: p.category, location: [p.lng, p.lat] }
    }
}

/// The hits of a `GET /geocode/search` response (`{ "results": [...] }`); results without coordinates are skipped.
pub fn parse_search(body: &[u8]) -> Result<Vec<SearchHit>, String> {
    #[derive(Deserialize)]
    struct Response {
        results: Vec<RawHit>,
    }
    let r: Response = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    Ok(r.results
        .into_iter()
        .filter_map(|h| {
            let (lat, lng) = (h.lat.parse::<f64>().ok()?, h.lon.parse::<f64>().ok()?);
            let (name, detail) = split_name(&h.display_name);
            Some(SearchHit {
                name,
                detail,
                location: [lng, lat],
                category: h.place_type.or(h.category),
                osm_type: h.osm_type,
                osm_id: h.osm_id,
            })
        })
        .collect())
}

/// The places of a `GET /places` response (`{ "places": [...] }`).
pub fn parse_places(body: &[u8]) -> Result<Vec<Place>, String> {
    #[derive(Deserialize)]
    struct Response {
        places: Vec<RawPlace>,
    }
    let r: Response = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    Ok(r.places.into_iter().map(Place::from).collect())
}

/// The place of a `POST /places` response (`{ "place": {...} }`).
pub fn parse_place(body: &[u8]) -> Result<Place, String> {
    #[derive(Deserialize)]
    struct Response {
        place: RawPlace,
    }
    let r: Response = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    Ok(r.place.into())
}

/// The Maps server of the signed-in account, through the desktop shell's token broker.
#[derive(Debug, Default)]
pub struct LiveBackend;

impl LiveBackend {
    /// Install this app's token broker (the shell's, or the sandbox's under `KUBUNO_SANDBOX_DIR`). Call once before
    /// any request; a missing broker is logged and every request then fails cleanly.
    pub fn install_broker() {
        match kubuno_desktop_sync::tokens::BrokerProvider::for_app(crate::app::PROGRAM) {
            Ok(p) => kubuno_desktop_sync::tokens::install(Arc::new(p)),
            Err(e) => tracing::error!("[maps] no token broker: {e}"),
        }
    }

    fn request(method: &str, path: &str, body: Option<Vec<u8>>) -> Result<(u16, Vec<u8>), String> {
        let account = kubuno_desktop_sync::current_account()
            .map_err(|e| format!("{e:?}"))?
            .ok_or_else(|| "no account — is the Kubuno desktop shell running and signed in?".to_string())?;
        let mut api = kubuno_desktop_sync::account_api(&account);
        let resp = api.request(method, &format!("{MAPS_PREFIX}{path}"), &[], body).map_err(|e| format!("{e:?}"))?;
        Ok((resp.status, resp.body))
    }

    fn ok(status: u16, what: &str) -> Result<(), String> {
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err(format!("{what} → HTTP {status}"))
        }
    }
}

impl PlacesBackend for LiveBackend {
    fn search(&self, query: &str, bounds: Option<[f64; 4]>, lang: &str) -> Result<Vec<SearchHit>, String> {
        let mut path = format!("/geocode/search?q={}&limit=8&lang={}", urlencode(query), urlencode(lang));
        if let Some([s, w, n, e]) = bounds {
            path.push_str(&format!("&minlat={s}&minlng={w}&maxlat={n}&maxlng={e}"));
        }
        let (status, body) = Self::request("GET", &path, None)?;
        Self::ok(status, "search")?;
        parse_search(&body)
    }

    fn saved(&self) -> Result<Vec<Place>, String> {
        let (status, body) = Self::request("GET", "/places", None)?;
        Self::ok(status, "places")?;
        parse_places(&body)
    }

    fn save(&self, hit: &SearchHit) -> Result<Place, String> {
        let address = if hit.detail.is_empty() { hit.name.clone() } else { format!("{}, {}", hit.name, hit.detail) };
        let body = serde_json::json!({
            "name": hit.name,
            "address": address,
            "category": hit.category,
            "lat": hit.location[1],
            "lng": hit.location[0],
            "osm_type": hit.osm_type,
            "osm_id": hit.osm_id,
        });
        let (status, resp) = Self::request("POST", "/places", Some(body.to_string().into_bytes()))?;
        Self::ok(status, "save place")?;
        parse_place(&resp)
    }

    fn delete(&self, place: &Place) -> Result<(), String> {
        let id = place.id.as_deref().ok_or("an unsaved place")?;
        let (status, _) = Self::request("DELETE", &format!("/places/{}", urlencode(id)), None)?;
        Self::ok(status, "delete place")
    }
}

/// Fold a string for matching: lower case, the common Latin accents removed, hyphens and apostrophes read as spaces
/// (« notre dame » finds « Notre-Dame »), runs of spaces collapsed.
fn fold(s: &str) -> String {
    let folded: String = s
        .chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            '-' | '\'' | '’' => ' ',
            'à' | 'â' | 'ä' | 'á' | 'ã' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'û' | 'ü' | 'ú' | 'ù' => 'u',
            'ç' => 'c',
            'ÿ' => 'y',
            other => other,
        })
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The offline sample: a small gazetteer to search, and saved places kept in memory.
pub struct SampleBackend {
    saved: Mutex<Vec<Place>>,
}

impl Default for SampleBackend {
    fn default() -> Self {
        let saved = crate::sample::places()
            .into_iter()
            .map(|p| Place { id: None, name: p.name.to_string(), address: Some("Paris, France".to_string()), category: None, location: p.location })
            .collect();
        Self { saved: Mutex::new(saved) }
    }
}

impl SampleBackend {
    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Place>> {
        self.saved.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl PlacesBackend for SampleBackend {
    fn search(&self, query: &str, _bounds: Option<[f64; 4]>, _lang: &str) -> Result<Vec<SearchHit>, String> {
        let q = fold(query.trim());
        if q.is_empty() {
            return Ok(Vec::new());
        }
        Ok(crate::sample::gazetteer()
            .into_iter()
            .filter(|g| fold(g.name).contains(&q) || fold(g.detail).contains(&q))
            .map(|g| SearchHit {
                name: g.name.to_string(),
                detail: g.detail.to_string(),
                location: g.location,
                category: Some(g.category.to_string()),
                osm_type: None,
                osm_id: None,
            })
            .collect())
    }

    fn saved(&self) -> Result<Vec<Place>, String> {
        Ok(self.lock().clone())
    }

    fn save(&self, hit: &SearchHit) -> Result<Place, String> {
        let place = Place {
            id: Some(format!("sample-{}", self.lock().len() + 1)),
            name: hit.name.clone(),
            address: Some(hit.detail.clone()),
            category: hit.category.clone(),
            location: hit.location,
        };
        self.lock().push(place.clone());
        Ok(place)
    }

    fn delete(&self, place: &Place) -> Result<(), String> {
        self.lock().retain(|p| p != place);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_server_search_response() {
        let body = br#"{"results":[
            {"place_id":1,"osm_type":"way","osm_id":5013364,"display_name":"Tour Eiffel, 5, Avenue Anatole France, Paris, France",
             "lat":"48.8582599","lon":"2.2945006","category":"man_made","type":"tower","importance":0.7},
            {"display_name":"Nowhere","lat":"n/a","lon":"2.0"}
        ]}"#;
        let hits = parse_search(body).expect("parse");
        assert_eq!(hits.len(), 1, "a result without coordinates is skipped");
        let h = &hits[0];
        assert_eq!(h.name, "Tour Eiffel");
        assert!(h.detail.starts_with("5, Avenue Anatole France"));
        assert_eq!(h.location, [2.2945006, 48.8582599]);
        assert_eq!(h.category.as_deref(), Some("tower"));
        assert_eq!((h.osm_type.as_deref(), h.osm_id), (Some("way"), Some(5013364)));
    }

    #[test]
    fn parses_saved_places() {
        let body = br#"{"places":[{"id":"7c1e","owner_id":"u","name":"Bureau","address":"1 rue X","category":null,
            "lat":48.85,"lng":2.35,"nominatim_data":{},"user_note":null,"user_tags":[],"icon":"pin"}]}"#;
        let places = parse_places(body).expect("parse");
        assert_eq!(places[0].id.as_deref(), Some("7c1e"));
        assert_eq!(places[0].location, [2.35, 48.85]);
        let one = parse_place(br#"{"place":{"id":"9","name":"Gare","lat":1.0,"lng":2.0}}"#).expect("place");
        assert_eq!((one.name.as_str(), one.location), ("Gare", [2.0, 1.0]));
    }

    #[test]
    fn sample_search_folds_case_and_accents_and_saves() {
        let b = SampleBackend::default();
        let hits = b.search("notre dame", None, "fr").expect("search");
        assert!(hits.iter().any(|h| h.name.contains("Notre-Dame") || h.name.contains("Notre Dame")));
        assert!(b.search("MUSEE", None, "fr").expect("search").iter().any(|h| h.name.contains("Musée")));
        assert!(b.search("   ", None, "fr").expect("search").is_empty());
        let before = b.saved().expect("saved").len();
        let saved = b.save(&hits[0]).expect("save");
        assert_eq!(b.saved().expect("saved").len(), before + 1);
        b.delete(&saved).expect("delete");
        assert_eq!(b.saved().expect("saved").len(), before);
    }

    #[test]
    fn urlencoding() {
        assert_eq!(urlencode("Tour Eiffel & co"), "Tour%20Eiffel%20%26%20co");
        assert_eq!(urlencode("é"), "%C3%A9");
    }
}
