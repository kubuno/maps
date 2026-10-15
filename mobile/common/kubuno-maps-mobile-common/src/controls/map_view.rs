//! `MapView` — the interactive themed map of the Maps mobile app, a host control of the shared renderer
//! (`kubuno_mobile_render::HostControl`).
//!
//! A small "slippy map" over pre-rendered snapshots of the Kubuno web basemap (OpenFreeMap "Liberty" + the Kubuno
//! theme, the same `applyTheme` as the web) at several zoom levels. The shell routes finger gestures to it (pan /
//! pinch-zoom); it keeps the viewport, picks the right level and draws it full-bleed, behind the screen's floating
//! overlays. `Route="true"` adds the (real, road-following) route with its origin/destination markers; otherwise a
//! centred location pin is drawn unless `Marker="none"`. Map data © OpenStreetMap contributors (ODbL), drawn as an
//! overlay so it stays visible; OpenFreeMap tiles.
//!
//! On a device the target is the native MapLibre control (vector, infinite zoom/pan); these embedded levels are the
//! offline stand-in: real detail at each captured level, within the captured region.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use kubuno_maps_core::tiles::{mercator_x, mercator_y};
use kubuno_mobile_render::tiny_skia::Pixmap;
use kubuno_mobile_render::{decode_jpeg, HostCanvas, HostControl, HostElement, HostRect, Rgba};

/// One pre-rendered zoom level: the themed snapshot and the geographic bounds it covers.
struct Level {
    jpg: &'static [u8],
    w: f64,
    s: f64,
    e: f64,
    n: f64,
}

/// The captured levels (L0 = widest, for panning; L6 = finest, for detail), same centre, half-zoom spacing so
/// zooming stays crisp, each a retina (2048 px) render. Bounds come from MapLibre's `getBounds()` at capture time
/// (see `assets/maps/README.md`).
const LEVELS: &[Level] = &[
    Level { jpg: include_bytes!("../assets/maps/map-L0.jpg"), w: 2.317054687498512, s: 48.830079399327445, e: 2.4049453124981994, n: 48.887903900526624 },
    Level { jpg: include_bytes!("../assets/maps/map-L1.jpg"), w: 2.335760045910149, s: 48.842391518298, e: 2.386239954089092, n: 48.87560297270801 },
    Level { jpg: include_bytes!("../assets/maps/map-L2.jpg"), w: 2.3465034531297135, s: 48.84946160562026, e: 2.375496546871915, n: 48.86853657708886 },
    Level { jpg: include_bytes!("../assets/maps/map-L3.jpg"), w: 2.352673920226721, s: 48.85352185317751, e: 2.369326079771355, n: 48.86447754734053 },
    Level { jpg: include_bytes!("../assets/maps/map-L4.jpg"), w: 2.3562179229315348, s: 48.85585370415734, e: 2.3657820770696105, n: 48.86214609808712 },
    Level { jpg: include_bytes!("../assets/maps/map-L5.jpg"), w: 2.358253417967262, s: 48.857192951744025, e: 2.3637465820294494, n: 48.86080698302135 },
    Level { jpg: include_bytes!("../assets/maps/map-L6.jpg"), w: 2.3591879316402355, s: 48.857807800087215, e: 2.362812068358494, n: 48.86019217151727 },
];
const LEVEL_PX: f64 = 2048.0;

/// The demo route geometry (OSRM, follows real roads), one `lon,lat` per line.
const ROUTE_CSV: &str = include_str!("../assets/maps/route.csv");

/// The Kubuno accent (route line, origin marker) and the destination / pin reds, from the web map theme.
const ACCENT: Rgba = Rgba::rgb(0x1a, 0x73, 0xe8);
const DESTINATION: Rgba = Rgba::rgb(0xea, 0x43, 0x35);
const PIN: Rgba = Rgba::rgb(0xff, 0x37, 0x5f);
/// The land tone shown before a level is decoded (and around the captured region).
const LAND: Rgba = Rgba::rgb(0xe6, 0xea, 0xe3);

// ── Level geometry (normalised Web Mercator, y down — `kubuno_maps_core::tiles`) ─────────────────────────────────

fn mx0(i: usize) -> f64 {
    mercator_x(LEVELS[i].w)
}
fn mx1(i: usize) -> f64 {
    mercator_x(LEVELS[i].e)
}
/// Top edge (smaller y).
fn my0(i: usize) -> f64 {
    mercator_y(LEVELS[i].n)
}
/// Bottom edge.
fn my1(i: usize) -> f64 {
    mercator_y(LEVELS[i].s)
}
fn merc_w(i: usize) -> f64 {
    mx1(i) - mx0(i)
}
/// Screen pixels for the whole Mercator world when level `i` is drawn 1:1.
fn native_world_px(i: usize) -> f64 {
    LEVEL_PX / merc_w(i)
}
fn min_world_px() -> f64 {
    native_world_px(0) * 0.5
}
/// Zoom-in stops at the finest level's native resolution (a tiny 1.2× headroom keeps the end of a pinch
/// responsive): the raster is then never upscaled — always drawn at ≤ 1:1 — so it never pixelates.
fn max_world_px() -> f64 {
    native_world_px(LEVELS.len() - 1) * 1.2
}

/// The map viewport: `cx`,`cy` is the Mercator centre (0..1), `world_px` the screen pixels one whole Mercator world
/// spans (larger = zoomed in).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Viewport {
    cx: f64,
    cy: f64,
    world_px: f64,
}

impl Viewport {
    /// The initial framing: the captured centre, at roughly street level. (The levels are retina, so the default
    /// shows a level downscaled — crisp.)
    fn initial() -> Self {
        Viewport { cx: mercator_x(2.3610), cy: mercator_y(48.8590), world_px: native_world_px(3) * 0.53 }
    }

    /// Clamp the zoom to the captured range and keep the centre inside the widest level, so the map never drifts
    /// off the captured region.
    fn clamped(mut self) -> Self {
        self.world_px = self.world_px.clamp(min_world_px(), max_world_px());
        self.cx = self.cx.clamp(mx0(0), mx1(0));
        self.cy = self.cy.clamp(my0(0), my1(0));
        self
    }

    /// A `lon,lat` on a `w`×`h` surface.
    fn project(&self, lon: f64, lat: f64, w: f32, h: f32) -> (f32, f32) {
        let sx = w as f64 / 2.0 + (mercator_x(lon) - self.cx) * self.world_px;
        let sy = h as f64 / 2.0 + (mercator_y(lat) - self.cy) * self.world_px;
        (sx as f32, sy as f32)
    }

    /// Which level to draw over a `w`×`h` surface, the scale applied to its raster and the screen position of its
    /// top-left corner: the finest level that still covers the viewport and whose native resolution is at least the
    /// requested one (so it is downscaled, staying sharp), else the finest that covers.
    fn placement(&self, w: f32, h: f32) -> Placement {
        let hw = (w as f64 / 2.0) / self.world_px;
        let hh = (h as f64 / 2.0) / self.world_px;
        let (l, r, t, b) = (self.cx - hw, self.cx + hw, self.cy - hh, self.cy + hh);
        let covers = |i: usize| mx0(i) <= l && mx1(i) >= r && my0(i) <= t && my1(i) >= b;
        let mut finest_covering = None;
        let mut pick = None;
        for i in (0..LEVELS.len()).rev() {
            if covers(i) {
                finest_covering.get_or_insert(i);
                if native_world_px(i) >= self.world_px {
                    pick = Some(i);
                    break;
                }
            }
        }
        let level = pick.or(finest_covering).unwrap_or(0);
        Placement {
            level,
            scale: (self.world_px * merc_w(level) / LEVEL_PX) as f32,
            sx: (w as f64 / 2.0 + (mx0(level) - self.cx) * self.world_px) as f32,
            sy: (h as f64 / 2.0 + (my0(level) - self.cy) * self.world_px) as f32,
        }
    }
}

/// A route geometry: `lon,lat` points.
type Route = Rc<Vec<(f64, f64)>>;

/// How to draw one level into the surface.
#[derive(Debug)]
struct Placement {
    level: usize,
    scale: f32,
    sx: f32,
    sy: f32,
}

/// The `MapView` host control (see the module doc). Register it with [`crate::setup`].
pub struct MapView {
    viewport: Cell<Viewport>,
    version: Cell<u64>,
    /// The decoded level rasters (decoded on first use).
    levels: RefCell<Vec<Option<Rc<Pixmap>>>>,
    /// The parsed route (parsed on first use).
    route: RefCell<Option<Route>>,
}

impl Default for MapView {
    fn default() -> Self {
        Self {
            viewport: Cell::new(Viewport::initial()),
            version: Cell::new(0),
            levels: RefCell::new(vec![None; LEVELS.len()]),
            route: RefCell::new(None),
        }
    }
}

impl MapView {
    fn set(&self, v: Viewport) {
        self.viewport.set(v.clamped());
        self.version.set(self.version.get().wrapping_add(1));
    }

    fn level_pixmap(&self, i: usize) -> Option<Rc<Pixmap>> {
        let mut levels = self.levels.borrow_mut();
        if levels[i].is_none() {
            levels[i] = decode_jpeg(LEVELS[i].jpg).map(Rc::new);
        }
        levels[i].clone()
    }

    fn route(&self) -> Route {
        self.route
            .borrow_mut()
            .get_or_insert_with(|| {
                Rc::new(
                    ROUTE_CSV
                        .lines()
                        .filter_map(|l| {
                            let mut it = l.split(',');
                            Some((it.next()?.trim().parse().ok()?, it.next()?.trim().parse().ok()?))
                        })
                        .collect(),
                )
            })
            .clone()
    }
}

impl HostControl for MapView {
    /// The map fills the whole screen behind the search bar, the sheets and the buttons.
    fn is_background(&self) -> bool {
        true
    }

    fn paint(&self, canvas: &mut HostCanvas<'_, '_>, el: &HostElement<'_>, _rect: HostRect) {
        // Full-bleed: the whole surface, behind the system bars too.
        let (sw, sh) = (canvas.width(), canvas.height());
        let d = canvas.dpr();
        canvas.fill_rect(0.0, 0.0, sw, sh, 0.0, LAND);
        let v = self.viewport.get();
        let p = v.placement(sw, sh);
        if let Some(img) = self.level_pixmap(p.level) {
            canvas.draw_image(&img, p.sx, p.sy, p.scale);
        }
        if el.attr("Route").as_deref() == Some("true") {
            let pts: Vec<(f32, f32)> = self.route().iter().map(|&(lo, la)| v.project(lo, la, sw, sh)).collect();
            canvas.stroke_polyline(&pts, 11.0 * d, Rgba::WHITE);
            canvas.stroke_polyline(&pts, 7.0 * d, ACCENT);
            if let (Some(&(ox, oy)), Some(&(dx, dy))) = (pts.first(), pts.last()) {
                canvas.fill_circle(ox, oy, 9.0 * d, Rgba::WHITE);
                canvas.fill_circle(ox, oy, 6.0 * d, ACCENT);
                canvas.fill_circle(dx, dy, 9.0 * d, Rgba::WHITE);
                canvas.fill_circle(dx, dy, 6.0 * d, DESTINATION);
            }
        } else if el.attr("Marker").as_deref() != Some("none") {
            // Idle / place map: a centred location pin.
            canvas.draw_icon("MapPin", 0.0, 0.0, sw, sh, 48.0 * d, PIN);
        }
    }

    /// The ODbL credit chip at the bottom-left, above the gesture inset — drawn after the overlays so it is always
    /// visible (the basemap is OpenStreetMap data, served by OpenFreeMap).
    fn paint_overlay(&self, canvas: &mut HostCanvas<'_, '_>) {
        if !canvas.has_font() || canvas.width() <= 0.0 || canvas.height() <= 0.0 {
            return;
        }
        let d = canvas.dpr();
        let credit = "\u{00A9} OpenStreetMap";
        let px = 9.5 * d;
        let pad = 4.0 * d;
        let tw = canvas.text_width(credit, px, false);
        let bx = 6.0 * d;
        let bh = px + 2.0 * pad;
        let by = canvas.height() - canvas.bottom_inset() - bh - 6.0 * d;
        canvas.fill_rect(bx, by, bx + tw + 2.0 * pad, by + bh, 3.0 * d, Rgba(0xff, 0xff, 0xff, 0xe0));
        canvas.draw_text(credit, bx + pad, by + pad + px * 0.82, px, Rgba::rgb(0x5f, 0x63, 0x68), false);
    }

    fn version(&self) -> u64 {
        self.version.get()
    }

    fn pan(&self, dx: f32, dy: f32) {
        let mut v = self.viewport.get();
        v.cx -= dx as f64 / v.world_px;
        v.cy -= dy as f64 / v.world_px;
        self.set(v);
    }

    /// Pinch-zoom about the focus point, keeping that point fixed under the fingers.
    fn zoom(&self, factor: f32, focus_x: f32, focus_y: f32, w: f32, h: f32) {
        let mut v = self.viewport.get();
        let fx = focus_x as f64 - w as f64 / 2.0;
        let fy = focus_y as f64 - h as f64 / 2.0;
        let fmx = v.cx + fx / v.world_px;
        let fmy = v.cy + fy / v.world_px;
        v.world_px = (v.world_px * factor as f64).clamp(min_world_px(), max_world_px());
        v.cx = fmx - fx / v.world_px;
        v.cy = fmy - fy / v.world_px;
        self.set(v);
    }

    fn reset(&self) {
        self.set(Viewport::initial());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_nest_from_widest_to_finest() {
        for i in 1..LEVELS.len() {
            assert!(merc_w(i) < merc_w(i - 1), "level {i} narrower than {}", i - 1);
            assert!(mx0(i) >= mx0(0) && mx1(i) <= mx1(0), "level {i} inside L0");
        }
    }

    #[test]
    fn default_framing_covers_the_whole_screen() {
        // A phone in portrait: the chosen level's raster must cover the whole surface (no blank edge).
        let (w, h) = (1080.0_f32, 2340.0_f32);
        let p = Viewport::initial().placement(w, h);
        let side = LEVEL_PX as f32 * p.scale;
        assert!(p.sx <= 0.0 && p.sy <= 0.0, "raster starts at or before the top-left: {p:?}");
        assert!(p.sx + side >= w && p.sy + side >= h, "raster reaches the bottom-right: {p:?}");
    }

    #[test]
    fn pinch_keeps_the_focus_point_fixed_and_respects_the_zoom_cap() {
        let map = MapView::default();
        let (w, h) = (1080.0, 2340.0);
        let before = map.viewport.get();
        let focus = (300.0_f32, 900.0_f32);
        let geo = |v: Viewport| {
            (v.cx + (focus.0 as f64 - w as f64 / 2.0) / v.world_px, v.cy + (focus.1 as f64 - h as f64 / 2.0) / v.world_px)
        };
        let v0 = map.version();
        map.zoom(1.5, focus.0, focus.1, w, h);
        let after = map.viewport.get();
        assert!(map.version() != v0, "a gesture bumps the version");
        assert!(after.world_px > before.world_px);
        let (a, b) = (geo(before), geo(after));
        assert!((a.0 - b.0).abs() < 1e-9 && (a.1 - b.1).abs() < 1e-9, "focus stays under the fingers");
        for _ in 0..40 {
            map.zoom(2.0, w / 2.0, h / 2.0, w, h);
        }
        assert!(map.viewport.get().world_px <= max_world_px() + 1e-6, "zoom is capped");
        map.reset();
        assert_eq!(map.viewport.get(), Viewport::initial().clamped());
    }

    #[test]
    fn route_parses_and_decodes() {
        let map = MapView::default();
        assert!(map.route().len() > 100, "the OSRM route has its points");
        assert!(map.level_pixmap(0).is_some(), "the widest level decodes");
    }
}
