//! Web Mercator (slippy-map) tile math, ported from the web's `mapOffline.ts`.
//!
//! The web's offline basemap pre-fills a tile cache for the visible bounding box; the same enumeration is what
//! any raster cache (desktop offline mode included) needs. These are pure integer-grid conversions - no network,
//! no cache - so they belong in the shared core and stay identical across web, desktop and mobile.

use serde::{Deserialize, Serialize};

/// Anti-runaway-download guard: the maximum number of tiles [`tiles_for_bbox`] enumerates for one area
/// (the web's `MAX_TILES`).
pub const MAX_OFFLINE_TILES: usize = 1500;

/// A slippy-map tile address.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Tile {
    pub z: u32,
    pub x: u32,
    pub y: u32,
}

/// The Web Mercator latitude limit (the square world's top/bottom edge), in degrees.
pub const MERCATOR_MAX_LAT: f64 = 85.051_128_779_806_59;

/// A longitude projected to normalised Web Mercator `x` (0 at the antimeridian west, 1 at its east). Multiplying
/// by `2^z` gives the fractional tile column at zoom `z` - a renderer's continuous counterpart of
/// [`lon_to_tile_x`].
pub fn mercator_x(lon: f64) -> f64 {
    (lon + 180.0) / 360.0
}

/// A latitude projected to normalised Web Mercator `y` (0 at the top edge, 1 at the bottom, y grows southwards),
/// clamped to [`MERCATOR_MAX_LAT`]. Multiplying by `2^z` gives the fractional tile row at zoom `z`.
pub fn mercator_y(lat: f64) -> f64 {
    let s = lat.clamp(-MERCATOR_MAX_LAT, MERCATOR_MAX_LAT).to_radians().sin();
    0.5 - ((1.0 + s) / (1.0 - s)).ln() / (4.0 * std::f64::consts::PI)
}

/// The longitude of a normalised Web Mercator `x` (the inverse of [`mercator_x`]).
pub fn mercator_lng(x: f64) -> f64 {
    x * 360.0 - 180.0
}

/// The latitude of a normalised Web Mercator `y` (the inverse of [`mercator_y`]).
pub fn mercator_lat(y: f64) -> f64 {
    (std::f64::consts::PI * (1.0 - 2.0 * y)).sinh().atan().to_degrees()
}

/// Tile column for a longitude at zoom `z` (the web's `lonToTileX`). Clamped to the valid grid so a longitude at
/// or beyond the antimeridian does not address a tile off the edge.
pub fn lon_to_tile_x(lon: f64, z: u32) -> u32 {
    let n = 2f64.powi(z as i32);
    let x = ((lon + 180.0) / 360.0 * n).floor();
    x.clamp(0.0, n - 1.0) as u32
}

/// Tile row for a latitude at zoom `z` (the web's `latToTileY`). Clamped to the valid grid so a latitude near the
/// poles (outside the Mercator limit) does not address a tile off the edge.
pub fn lat_to_tile_y(lat: f64, z: u32) -> u32 {
    let n = 2f64.powi(z as i32);
    let r = lat.to_radians();
    let y = ((1.0 - (r.tan() + 1.0 / r.cos()).ln() / std::f64::consts::PI) / 2.0 * n).floor();
    y.clamp(0.0, n - 1.0) as u32
}

/// Enumerates the tiles covering `bbox` (`[west, south, east, north]`) over the inclusive zoom range
/// `min_zoom..=max_zoom`, capped at [`MAX_OFFLINE_TILES`] (the web's `tilesForBbox`).
pub fn tiles_for_bbox(bbox: [f64; 4], min_zoom: u32, max_zoom: u32) -> Vec<Tile> {
    let [w, s, e, n] = bbox;
    let mut out = Vec::new();
    for z in min_zoom..=max_zoom {
        let x0 = lon_to_tile_x(w.min(e), z);
        let x1 = lon_to_tile_x(w.max(e), z);
        let y0 = lat_to_tile_y(n.max(s), z);
        let y1 = lat_to_tile_y(n.min(s), z);
        for x in x0..=x1 {
            for y in y0..=y1 {
                out.push(Tile { z, x, y });
                if out.len() >= MAX_OFFLINE_TILES {
                    return out;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_tiles() {
        // z0 is a single tile; (0,0) at every corner of the world.
        assert_eq!(lon_to_tile_x(-180.0, 0), 0);
        assert_eq!(lat_to_tile_y(85.0, 0), 0);
    }

    #[test]
    fn greenwich_equator_z1() {
        // At z1 the world is a 2x2 grid; lon 0 / lat 0 sits on the boundary, flooring into the second column/row.
        assert_eq!(lon_to_tile_x(0.0, 1), 1);
        assert_eq!(lat_to_tile_y(0.0, 1), 1);
    }

    #[test]
    fn bbox_is_capped() {
        // A whole-world bbox over a deep zoom range must stop at the guard, not allocate millions of tiles.
        let tiles = tiles_for_bbox([-180.0, -85.0, 180.0, 85.0], 0, 20);
        assert_eq!(tiles.len(), MAX_OFFLINE_TILES);
    }

    #[test]
    fn mercator_bounds_and_centre() {
        assert_eq!(mercator_x(-180.0), 0.0);
        assert_eq!(mercator_x(180.0), 1.0);
        assert!((mercator_y(0.0) - 0.5).abs() < 1e-12);
        assert!(mercator_y(MERCATOR_MAX_LAT).abs() < 1e-9);
        assert!((mercator_y(-MERCATOR_MAX_LAT) - 1.0).abs() < 1e-9);
        // Beyond the limit it clamps instead of diverging.
        assert!(mercator_y(89.9).abs() < 1e-9);
    }

    #[test]
    fn mercator_round_trips() {
        for (lng, lat) in [(2.3522, 48.8566), (-122.42, 37.77), (151.2, -33.87), (0.0, 0.0)] {
            assert!((mercator_lng(mercator_x(lng)) - lng).abs() < 1e-9);
            assert!((mercator_lat(mercator_y(lat)) - lat).abs() < 1e-9);
        }
    }

    #[test]
    fn mercator_agrees_with_the_tile_grid() {
        // The continuous projection floors to the integer tile of the web's formulas (Paris, several zooms).
        for z in [3u32, 10, 15] {
            let n = 2f64.powi(z as i32);
            assert_eq!((mercator_x(2.3522) * n).floor() as u32, lon_to_tile_x(2.3522, z));
            assert_eq!((mercator_y(48.8566) * n).floor() as u32, lat_to_tile_y(48.8566, z));
        }
    }

    #[test]
    fn small_bbox_single_tile_at_low_zoom() {
        let tiles = tiles_for_bbox([2.33, 48.85, 2.35, 48.87], 1, 1);
        assert_eq!(tiles.len(), 1);
        assert_eq!(tiles[0], Tile { z: 1, x: 1, y: 0 });
    }
}
