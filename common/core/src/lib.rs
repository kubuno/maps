//! # Kubuno Maps — shared core (sans-IO)
//!
//! The platform-neutral map model and the pure algorithms ported from the web app (`Z:\src\maps\web\src`), so
//! the desktop app, the mobile app and the server-held web client all compute the same results. The map
//! *rendering* is deliberately **not** here: the web paints with MapLibre GL, the desktop paints with a native
//! map surface (see `DESKTOP-CONVERSION.md`), and only the pure inputs those renderers share live in this crate.
//!
//! Modules:
//! - [`tiles`]  — Web Mercator / slippy-map tile math (ported from `mapOffline.ts`): lon/lat → tile x/y and the
//!   enumeration of the tiles covering a bbox (the offline "download this area" set, reused by any raster cache).
//! - [`geo`]    — geodesic geometry (ported from `mapSketch.ts` / `greatCircle.ts` / `navigation.ts`): haversine
//!   distance, polyline length, spherical-excess polygon area, bearing, circle ring and the great-circle arc.
//! - [`basemap`]— the basemap and overlay catalogue (ported from `mapsLayers.ts`): which basemaps and overlays
//!   exist, their tile templates and attributions, independent of how a client draws them.
//! - [`theme`]  — the Kubuno map theme palette (ported from `mapsTheme.ts` `THEME`): the fixed colour tokens the
//!   default basemap restyles the OpenFreeMap Liberty vector style with.
//! - [`format`] — the distance / area / duration formatters (ported from `mapSketch.ts` / `routing.ts`).
//!
//! Sans-IO: no network, database, file system, clock, async runtime, UI or C library. Every function takes its
//! inputs from the caller and returns data.

pub mod basemap;
pub mod format;
pub mod geo;
pub mod mvt;
pub mod style;
pub mod theme;
pub mod tiles;

pub use basemap::{BaseMap, Overlay};
pub use geo::{LngLat, EARTH_RADIUS_M};
pub use tiles::{Tile, MAX_OFFLINE_TILES};
