//! The basemap and overlay catalogue, ported from the web's `mapsLayers.ts`.
//!
//! The web builds MapLibre `StyleSpecification` objects; a native desktop/mobile renderer needs the same facts
//! in a renderer-agnostic form: which basemaps and overlays exist, their tile URL templates, their attribution
//! and their zoom limits. This module carries only those descriptors — turning a descriptor into whatever the
//! client draws (a MapLibre style, a native raster layer) is the renderer's job, not the core's.

use serde::{Deserialize, Serialize};

/// The basemaps the user can switch between (the web's `BaseMap`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BaseMap {
    /// OpenFreeMap Liberty vector style restyled with the Kubuno theme (the web's `kbstyle://default`). This one
    /// is vector and themed — see [`crate::theme`] for the palette the restyle applies.
    Default,
    /// OpenFreeMap Positron — a light / minimal vector style.
    Light,
    /// OpenTopoMap raster — contour lines and engraved relief.
    Terrain,
    /// ESRI World Imagery raster, with an optional reference (labels) overlay.
    Satellite,
    /// OpenStreetMap raster served cache-first for offline use (the web's `kbtile://` protocol).
    Offline,
}

impl BaseMap {
    /// The stable identifier the client stores and the web uses in its UI state.
    pub fn id(self) -> &'static str {
        match self {
            BaseMap::Default => "default",
            BaseMap::Light => "light",
            BaseMap::Terrain => "terrain",
            BaseMap::Satellite => "satellite",
            BaseMap::Offline => "offline",
        }
    }

    /// Whether this basemap is a vector style (themed, label layers are `symbol`) rather than raster tiles.
    pub fn is_vector(self) -> bool {
        matches!(self, BaseMap::Default | BaseMap::Light)
    }

    /// The raster tile sources this basemap draws, in draw order (empty for the vector basemaps, which stream a
    /// style JSON from their upstream URL instead). The web builds these in `satelliteStyle` / `topoStyle` /
    /// `offlineRasterStyle`.
    pub fn raster_sources(self) -> &'static [TileSource] {
        match self {
            BaseMap::Satellite => SATELLITE_SOURCES,
            BaseMap::Terrain => TERRAIN_SOURCES,
            BaseMap::Offline => OFFLINE_SOURCES,
            BaseMap::Default | BaseMap::Light => &[],
        }
    }

    /// The upstream style URL for a vector basemap (`None` for raster basemaps). `Default` streams the themed
    /// Liberty style (see [`crate::theme::UPSTREAM_STYLE`]); `Light` streams Positron.
    pub fn vector_style_url(self) -> Option<&'static str> {
        match self {
            BaseMap::Default => Some(crate::theme::UPSTREAM_STYLE),
            BaseMap::Light => Some("https://tiles.openfreemap.org/styles/positron"),
            _ => None,
        }
    }
}

/// A raster tile source: one or more URL templates (`{z}/{x}/{y}`, round-robin subdomains like the web), its
/// attribution and an optional max zoom. A static descriptor (`&'static str` fields), so it is not a serde
/// wire type — the client reads it, it never crosses the network.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileSource {
    /// A short stable key for the source (the web's source id, e.g. `"sat-img"`).
    pub id: &'static str,
    /// The `{z}/{x}/{y}` (or `{z}/{y}/{x}` for ESRI) URL templates.
    pub tiles: &'static [&'static str],
    /// Human attribution text shown on the map.
    pub attribution: &'static str,
    /// Max zoom, if the source caps it (`None` = no cap).
    pub max_zoom: Option<u32>,
    /// Whether this source is a reference (labels) layer that can be toggled independently (the web's `sat-ref`).
    pub is_reference: bool,
}

/// The overlays that can be layered over any basemap (the web's `applyCycle` / `applyRelief` / `applyTransit` /
/// `applyPrecip` and the DEM-backed 3D terrain).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Overlay {
    /// CyclOSM cycle network (raster).
    Cycle,
    /// Hillshade relief from the Terrarium DEM.
    Relief,
    /// 3D terrain extrusion from the same DEM.
    Terrain3D,
    /// ÖPNVKarte public-transport network (raster).
    Transit,
    /// RainViewer precipitation radar (raster, latest frame).
    Precip,
}

// ── Source tables (ported one-to-one from mapsLayers.ts) ─────────────────────────

const SATELLITE_SOURCES: &[TileSource] = &[
    TileSource {
        id: "sat-img",
        tiles: &["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
        max_zoom: None,
        is_reference: false,
    },
    TileSource {
        id: "sat-ref",
        tiles: &["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
        attribution: "© Esri",
        max_zoom: None,
        is_reference: true,
    },
];

const TERRAIN_SOURCES: &[TileSource] = &[TileSource {
    id: "topo",
    tiles: &[
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    attribution: "© OpenTopoMap (CC-BY-SA), OpenStreetMap",
    max_zoom: Some(17),
    is_reference: false,
}];

const OFFLINE_SOURCES: &[TileSource] = &[TileSource {
    id: "osm",
    tiles: &["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap (offline)",
    max_zoom: Some(19),
    is_reference: false,
}];

/// The overlay raster sources (the web's `applyCycle` / `applyTransit` / `applyPrecip` and the shared DEM). The
/// precipitation radar resolves its host and current frame at runtime, so only its template shape is here.
impl Overlay {
    /// The stable identifier (the web's layer id).
    pub fn id(self) -> &'static str {
        match self {
            Overlay::Cycle => "overlay-cycle",
            Overlay::Relief => "overlay-relief",
            Overlay::Terrain3D => "overlay-terrain-3d",
            Overlay::Transit => "overlay-transit",
            Overlay::Precip => "overlay-precip",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basemap_ids_round_trip_through_serde() {
        for b in [
            BaseMap::Default,
            BaseMap::Light,
            BaseMap::Terrain,
            BaseMap::Satellite,
            BaseMap::Offline,
        ] {
            let json = serde_json::to_string(&b).unwrap();
            assert_eq!(json, format!("\"{}\"", b.id()));
            let back: BaseMap = serde_json::from_str(&json).unwrap();
            assert_eq!(back, b);
        }
    }

    #[test]
    fn vector_basemaps_have_a_style_url_and_no_raster() {
        assert!(BaseMap::Default.vector_style_url().is_some());
        assert!(BaseMap::Default.raster_sources().is_empty());
        assert!(BaseMap::Satellite.vector_style_url().is_none());
        assert_eq!(BaseMap::Satellite.raster_sources().len(), 2);
    }

    #[test]
    fn satellite_reference_is_toggleable() {
        let refs: Vec<_> = BaseMap::Satellite
            .raster_sources()
            .iter()
            .filter(|s| s.is_reference)
            .collect();
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].id, "sat-ref");
    }
}
