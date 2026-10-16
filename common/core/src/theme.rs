//! The Kubuno map theme palette, ported from the web's `mapsTheme.ts` `THEME`.
//!
//! The default basemap is the OpenFreeMap Liberty vector style restyled into the quiet, neutral consumer-map
//! look (near-white land, soft green vegetation, teal-blue water, white streets on a light-grey urban mask,
//! grey-blue motorways, colour-coded road shields and category-tinted POI labels). The web applies this by
//! patching the upstream Liberty style JSON layer by layer; a native renderer applies the same tokens to its own
//! style. Only the colour palette (the renderer-agnostic part) is ported here - the layer-id-specific patch
//! logic stays with each renderer, because the layer ids are a MapLibre style detail.

/// The custom-protocol URL the web asks MapLibre for the themed default style with (`kbstyle://default`). Kept so
/// a client that proxies styles can recognise it; a native renderer may ignore it and fetch [`UPSTREAM_STYLE`].
pub const THEME_STYLE_URL: &str = "kbstyle://default";

/// The upstream vector style the Kubuno theme restyles (OpenFreeMap Liberty).
pub const UPSTREAM_STYLE: &str = "https://tiles.openfreemap.org/styles/liberty";

/// A fill/casing colour pair for a road or tunnel class.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoadColor {
    pub fill: &'static str,
    pub casing: &'static str,
}

/// A road-shield colour triple (badge fill, border stroke, label text).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShieldColor {
    pub fill: &'static str,
    pub stroke: &'static str,
    pub text: &'static str,
}

/// The land / water / landcover / building fill tokens (the flat keys of the web's `THEME`).
pub mod land {
    pub const LAND: &str = "#f5f5f5";
    pub const URBAN: &str = "#ececec";
    pub const COMMERCIAL: &str = "#f4efe5";
    pub const PARK: &str = "#c9e7c4";
    pub const WOOD: &str = "#d0e8ca";
    pub const GRASS: &str = "#dcefd8";
    pub const PITCH: &str = "#d5ead0";
    pub const CEMETERY: &str = "#d0e2cb";
    pub const HOSPITAL: &str = "#f7e6e6";
    pub const SCHOOL: &str = "#f0eee3";
    pub const SAND: &str = "#f3eddc";
    pub const ICE: &str = "#eef3f5";
    pub const WATER: &str = "#a6d5ea";
    pub const AEROWAY: &str = "#e6e6e6";
    pub const BUILDING: &str = "#e8e8e8";
    pub const BUILDING_LINE: &str = "#dadada";
    pub const BOUNDARY: &str = "#8f8f8f";
    pub const BOUNDARY_LOW: &str = "#b8b8b8";
    pub const RAIL: &str = "#d2d2d2";
}

/// Road fill/casing colours by class (the web's `THEME.road`).
pub mod road {
    use super::RoadColor;
    pub const MOTORWAY: RoadColor = RoadColor { fill: "#a9b5c6", casing: "#8c98ab" };
    pub const PRIMARY: RoadColor = RoadColor { fill: "#cbd3de", casing: "#aab4c3" };
    pub const SECONDARY: RoadColor = RoadColor { fill: "#ffffff", casing: "#d3d7dd" };
    pub const MINOR: RoadColor = RoadColor { fill: "#ffffff", casing: "#dfe1e5" };
    /// Minor streets at their first zoom levels, before the casing fades in.
    pub const MINOR_LOW: &str = "#e0e0e0";
    pub const PATH: &str = "#d0d2d6";
}

/// Tunnel fill/casing colours (the web's `THEME.tunnel`).
pub mod tunnel {
    use super::RoadColor;
    pub const MOTORWAY: RoadColor = RoadColor { fill: "#d3d9e2", casing: "#b6bec9" };
    pub const PRIMARY: RoadColor = RoadColor { fill: "#e3e7ed", casing: "#c4ccd6" };
    pub const OTHER: RoadColor = RoadColor { fill: "#f5f5f5", casing: "#e0e0e0" };
}

/// Label text colours (the web's `THEME.text`).
pub mod text {
    pub const PLACE: &str = "#202124";
    pub const PLACE_MINOR: &str = "#3c4043";
    pub const OTHER: &str = "#5f6368";
    pub const ROAD: &str = "#616161";
    pub const PATH: &str = "#8a8a8a";
    pub const WATER: &str = "#4d8fc4";
    pub const HALO: &str = "#ffffff";
}

/// POI label colours by category (the web's `THEME.poi`).
pub mod poi {
    pub const PARK: &str = "#1e8e3e";
    pub const SHOP: &str = "#4a7fd6";
    pub const FOOD: &str = "#e8710a";
    pub const HEALTH: &str = "#d93025";
    pub const LODGING: &str = "#e7539a";
    pub const TRANSIT: &str = "#1a73e8";
    pub const CIVIC: &str = "#6e7fa0";
    pub const CULTURE: &str = "#12a0a0";
    pub const OTHER: &str = "#5f6368";
}

/// Road-shield colours by kind (the web's `THEME.shield`).
pub mod shield {
    use super::ShieldColor;
    /// French A / N motorway shield.
    pub const MOTORWAY: ShieldColor = ShieldColor { fill: "#d9463d", stroke: "#b8332b", text: "#ffffff" };
    /// French D regional-road shield.
    pub const REGIONAL: ShieldColor = ShieldColor { fill: "#f6c945", stroke: "#d9ab1f", text: "#3c4043" };
    /// European E-route shield.
    pub const EUROPEAN: ShieldColor = ShieldColor { fill: "#2f9e4f", stroke: "#22803c", text: "#ffffff" };
    pub const OTHER: ShieldColor = ShieldColor { fill: "#ffffff", stroke: "#9aa0a6", text: "#3c4043" };
}

/// The colour an imported GeoJSON / KML layer is drawn in (the web's `IMPORT_COLOR` in `mapsLayers.ts`).
pub const IMPORT_COLOR: &str = "#9334e6";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_matches_web_tokens() {
        assert_eq!(land::LAND, "#f5f5f5");
        assert_eq!(land::WATER, "#a6d5ea");
        assert_eq!(road::MOTORWAY.fill, "#a9b5c6");
        assert_eq!(shield::MOTORWAY.text, "#ffffff");
        assert_eq!(poi::FOOD, "#e8710a");
    }
}
