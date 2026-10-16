//! The map view state: what the camera looks at and which layers are on.
//!
//! Ported in spirit from the web's `mapsUiStore.ts` and the `MapsPage` camera state (centre, zoom, basemap,
//! overlays, labels). It is pure data with pure mutators, so it is unit-tested without a window and shared by
//! every OS front end; the actual map surface reads this state to decide what to draw.

use std::collections::BTreeSet;

use kubuno_maps_core::basemap::{BaseMap, Overlay};
use kubuno_maps_core::geo::LngLat;
use kubuno_maps_core::tiles::{mercator_lat, mercator_lng, mercator_x, mercator_y};

/// The camera and layer selection of the map.
#[derive(Debug, Clone, PartialEq)]
pub struct MapView {
    /// Camera centre as `[lng, lat]` degrees (the web / MapLibre order).
    pub center: LngLat,
    /// Zoom level (MapLibre scale: 0 = whole world).
    pub zoom: f64,
    /// Bearing (map rotation) in degrees.
    pub bearing: f64,
    /// Pitch (tilt) in degrees.
    pub pitch: f64,
    /// The active basemap.
    pub basemap: BaseMap,
    /// The overlays currently shown over the basemap.
    pub overlays: BTreeSet<&'static str>,
    /// Whether place / street labels are shown.
    pub labels: bool,
}

impl Default for MapView {
    /// The world view the web opens on before the server's configured default lands (centre of France, low zoom).
    fn default() -> Self {
        MapView {
            center: [2.3522, 48.8566],
            zoom: 5.0,
            bearing: 0.0,
            pitch: 0.0,
            basemap: BaseMap::Default,
            overlays: BTreeSet::new(),
            labels: true,
        }
    }
}

impl MapView {
    /// Switches the basemap, keeping the camera where it is.
    pub fn set_basemap(&mut self, basemap: BaseMap) {
        self.basemap = basemap;
    }

    /// Toggles an overlay on or off; returns whether it is now on.
    pub fn toggle_overlay(&mut self, overlay: Overlay) -> bool {
        let id = overlay.id();
        if self.overlays.remove(id) {
            false
        } else {
            self.overlays.insert(id);
            true
        }
    }

    /// Whether an overlay is currently shown.
    pub fn has_overlay(&self, overlay: Overlay) -> bool {
        self.overlays.contains(overlay.id())
    }

    /// Clamps the zoom to the MapLibre range `[0, 22]` after a programmatic change.
    pub fn clamp_zoom(&mut self) {
        self.zoom = self.zoom.clamp(0.0, 22.0);
    }

    /// Screen pixels one whole Web Mercator world spans at `zoom` (MapLibre's 512-px tiles).
    pub fn world_size(zoom: f64) -> f64 {
        512.0 * 2f64.powf(zoom)
    }

    /// The camera centre in world pixels at the current zoom.
    pub fn center_px(&self) -> (f64, f64) {
        let ws = Self::world_size(self.zoom);
        (mercator_x(self.center[0]) * ws, mercator_y(self.center[1]) * ws)
    }

    fn set_center_px(&mut self, x: f64, y: f64) {
        let ws = Self::world_size(self.zoom);
        let (nx, ny) = ((x / ws).rem_euclid(1.0), (y / ws).clamp(0.0, 1.0));
        self.center = [mercator_lng(nx), mercator_lat(ny)];
    }

    /// Drag the map by a pointer delta in screen pixels (the map follows the pointer).
    pub fn pan_px(&mut self, dx: f64, dy: f64) {
        let (cx, cy) = self.center_px();
        self.set_center_px(cx - dx, cy - dy);
    }

    /// Zoom by `delta` levels keeping the point `(fx, fy)` of a `w`×`h` view (pixels from its top-left) fixed - a
    /// wheel notch over a street keeps that street under the pointer. Zoom stays within `[1, 20]`.
    pub fn zoom_about(&mut self, delta: f64, fx: f64, fy: f64, w: f64, h: f64) {
        let (cx, cy) = self.center_px();
        let (ox, oy) = (fx - w / 2.0, fy - h / 2.0);
        let old_ws = Self::world_size(self.zoom);
        let (gx, gy) = ((cx + ox) / old_ws, (cy + oy) / old_ws);
        self.zoom = (self.zoom + delta).clamp(1.0, 20.0);
        let ws = Self::world_size(self.zoom);
        self.set_center_px(gx * ws - ox, gy * ws - oy);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_toggles() {
        let mut v = MapView::default();
        assert!(!v.has_overlay(Overlay::Relief));
        assert!(v.toggle_overlay(Overlay::Relief));
        assert!(v.has_overlay(Overlay::Relief));
        assert!(!v.toggle_overlay(Overlay::Relief));
        assert!(!v.has_overlay(Overlay::Relief));
    }

    #[test]
    fn zoom_clamps() {
        let mut v = MapView { zoom: 99.0, ..MapView::default() };
        v.clamp_zoom();
        assert_eq!(v.zoom, 22.0);
    }

    #[test]
    fn panning_follows_the_pointer() {
        let mut v = MapView { zoom: 12.0, ..MapView::default() };
        let before = v.center_px();
        v.pan_px(100.0, -40.0);
        let after = v.center_px();
        assert!((before.0 - after.0 - 100.0).abs() < 1e-6 && (before.1 - after.1 + 40.0).abs() < 1e-6);
    }

    #[test]
    fn zooming_keeps_the_pointed_place_fixed() {
        let mut v = MapView { zoom: 11.0, ..MapView::default() };
        let (w, h, fx, fy) = (900.0, 700.0, 200.0, 150.0);
        let geo = |v: &MapView| {
            let (cx, cy) = v.center_px();
            let ws = MapView::world_size(v.zoom);
            (mercator_lng((cx + fx - w / 2.0) / ws), mercator_lat((cy + fy - h / 2.0) / ws))
        };
        let before = geo(&v);
        v.zoom_about(1.5, fx, fy, w, h);
        let after = geo(&v);
        assert!((v.zoom - 12.5).abs() < 1e-12);
        assert!((before.0 - after.0).abs() < 1e-9 && (before.1 - after.1).abs() < 1e-9);
        v.zoom_about(50.0, fx, fy, w, h);
        assert_eq!(v.zoom, 20.0);
    }
}
