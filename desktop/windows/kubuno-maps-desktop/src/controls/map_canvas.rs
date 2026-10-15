//! `MapCanvas` — the live map surface, drawn natively (Direct2D, so the GPU rasterises it — never a web view).
//!
//! Each basemap of the layers panel draws from a tile source of the portable [`TileStore`] (background download,
//! memory + disk cache), created when first shown:
//! - « Plan » and « Clair »: the OpenFreeMap vector tiles (the very data the web basemap draws), painted with the
//!   module's shared native style (`kubuno_maps_core::style`) in the Kubuno or the light palette;
//! - « Relief » (OpenTopoMap) and « Satellite » (Esri imagery, plus Esri's place names when labels are on): raster
//!   tiles of the shared catalogue, drawn as images;
//! - « Hors ligne »: the vector map from the disk cache only, never the network.
//!
//! The labels of the vector basemaps are placed over all tiles (most important first, never overlapping, never cut by
//! the edge); the saved places are dots under the labels and the picked place a pin over them (the places panel sets
//! both, [`MapCanvas::set_markers`]), and the basemap's attribution is drawn last. While a tile downloads, an already cached ancestor stands
//! in, scaled up, so the view is never blank. The pointer pans the map (drag) and zooms it about the pointer (wheel);
//! the camera and the layer choice are the shared [`MapView`] the toolbar and the layers panel read and write.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use kubuno_desktop::ui::graphics::{
    Brush, Color, FillMode, Font, FontStyle, Graphics, GraphicsPath, Image, LineCap, LineJoin, Pen, PointF, StringFormat,
};
use kubuno_desktop::ui::{Canvas, Rect, Size};
use kubuno_desktop::views::component::{Control, ControlCore, EventCx, PaintEventCx};
use kubuno_desktop::views::events::{MouseButton, MouseEventArgs};

use kubuno_maps_core::basemap::BaseMap;
use kubuno_maps_core::geo::LngLat;
use kubuno_maps_core::tiles::{mercator_x, mercator_y};
use kubuno_maps_core::mvt::{Point, Tile};
use kubuno_maps_core::style::{self, Label, Palette, Rgba, TileCanvas};
use kubuno_maps_desktop_common::state::MapView;
use kubuno_maps_desktop_common::tile_store::{Source, TileData, TileKey, TileStore};

use crate::controls::model::Shared;

/// How many ancestor levels may stand in for a tile still downloading.
const ANCESTOR_LEVELS: u8 = 5;
/// The most labels drawn at once.
const MAX_LABELS: usize = 160;
/// Wheel zoom per notch, in zoom levels.
const WHEEL_ZOOM: f64 = 0.5;

/// A tile hook shared by every store: called from a worker thread when a tile arrives.
type Notify = Arc<dyn Fn() + Send + Sync>;

/// How the tiles of one layer are painted.
#[derive(Clone, Copy)]
enum Layer {
    /// Vector tiles in a palette; their labels are collected.
    Vector(&'static Palette),
    /// Raster images.
    Raster,
}

/// One layer of a basemap: its store key, source, whether it is offline, and how it is painted.
type LayerSpec = (&'static str, Source, bool, Layer);

/// The live map surface (see the module doc).
#[derive(kubuno_desktop::views::component::Component, Default)]
#[kubuno(extends = Control, overrides(Control))]
#[category("Maps")]
#[toolbox(icon = "map")]
pub struct MapCanvas {
    base: ControlCore,
    model: Option<Shared>,
    /// The tile stores by key (`vector`, `vector-offline`, or a raster source id), created when first needed.
    stores: HashMap<&'static str, TileStore>,
    notify: Option<Notify>,
    cache_dir: Option<PathBuf>,
    /// The pointer position of an ongoing drag.
    drag: Option<(f32, f32)>,
    /// Called after the user moved the camera (the window refreshes its read-out).
    on_camera: Option<Box<dyn Fn()>>,
    /// The saved places, drawn as dots.
    saved: Vec<LngLat>,
    /// The picked place, drawn as a pin.
    pin: Option<LngLat>,
}

impl MapCanvas {
    /// Shares the window's map view state; repaints when the state changes.
    pub fn set_model(&mut self, model: Shared) {
        self.model = Some(model);
        self.invalidate();
    }

    /// Where tiles are cached, and the hook told (from a worker thread) when one arrives.
    pub fn set_tile_source(&mut self, cache_dir: Option<PathBuf>, notify: impl Fn() + Send + Sync + 'static) {
        self.cache_dir = cache_dir;
        self.notify = Some(Arc::new(notify));
        self.stores.clear();
        self.invalidate();
    }

    /// Called after each camera move made with the pointer.
    pub fn set_on_camera(&mut self, f: impl Fn() + 'static) {
        self.on_camera = Some(Box::new(f));
    }

    /// The places marked on the map: the saved ones (dots) and the picked one (a pin).
    pub fn set_markers(&mut self, saved: Vec<LngLat>, pin: Option<LngLat>) {
        self.saved = saved;
        self.pin = pin;
        self.invalidate();
    }

    /// The screen box of the pin (labels keep out of it; the saved-place dots lie under the labels instead, so a dot
    /// never hides a city name).
    fn pin_box(&self, view: &MapView, b: Rect) -> Vec<Rect> {
        self.pin.and_then(|p| project(view, b, p)).map(|(x, y)| Rect::new(x - 12.0, y - 38.0, x + 12.0, y + 3.0)).into_iter().collect()
    }

    fn camera_moved(&mut self) {
        self.invalidate();
        if let Some(f) = &self.on_camera {
            f();
        }
    }

    /// Start the store behind `key` if it is not running yet.
    fn ensure_store(&mut self, key: &'static str, source: Source, offline: bool) {
        let (Some(notify), dir) = (self.notify.clone(), self.cache_dir.clone()) else { return };
        self.stores.entry(key).or_insert_with(|| TileStore::new(source, offline, dir, move || notify()));
    }

    /// The layers of `basemap` (bottom first) and its attribution.
    fn layers(basemap: BaseMap, labels: bool) -> (Vec<LayerSpec>, String) {
        let vector_attribution = style::ATTRIBUTION.to_string();
        match basemap {
            BaseMap::Default => (vec![("vector", Source::Vector, false, Layer::Vector(&Palette::KUBUNO))], vector_attribution),
            BaseMap::Light => (vec![("vector", Source::Vector, false, Layer::Vector(&Palette::LIGHT))], vector_attribution),
            BaseMap::Offline => (vec![("vector-offline", Source::Vector, true, Layer::Vector(&Palette::KUBUNO))], vector_attribution),
            BaseMap::Terrain | BaseMap::Satellite => {
                let sources = basemap.raster_sources();
                let layers = sources
                    .iter()
                    .filter(|s| labels || !s.is_reference)
                    .map(|s| (s.id, Source::Raster(*s), false, Layer::Raster))
                    .collect();
                let attribution = sources.iter().find(|s| !s.is_reference).map_or_else(String::new, |s| s.attribution.to_string());
                (layers, attribution)
            }
        }
    }
}

fn color(c: Rgba) -> Color {
    Color::argb(c.a, c.r, c.g, c.b)
}

/// Paints one vector tile through the window's `Graphics`: tile-normalised geometry scaled to `size` DIP at `(ox, oy)`.
struct D2dTile<'g, 'a> {
    g: &'g Graphics<'a>,
    ox: f32,
    oy: f32,
    size: f32,
}

impl D2dTile<'_, '_> {
    fn pt(&self, p: Point) -> PointF {
        PointF::new(self.ox + p[0] * self.size, self.oy + p[1] * self.size)
    }

    fn rings(&self, polygons: &[Vec<Vec<Point>>]) -> GraphicsPath {
        let mut path = GraphicsPath::new().with_fill_mode(FillMode::Alternate);
        for ring in polygons.iter().flatten().filter(|r| r.len() >= 3) {
            let pts: Vec<PointF> = ring.iter().map(|&p| self.pt(p)).collect();
            path.add_polygon(&pts);
        }
        path
    }
}

impl TileCanvas for D2dTile<'_, '_> {
    fn fill_polygons(&mut self, c: Rgba, polygons: &[Vec<Vec<Point>>]) {
        let path = self.rings(polygons);
        if !path.is_empty() {
            self.g.fill_path(Brush::solid(color(c)), &path);
        }
    }

    fn stroke_lines(&mut self, c: Rgba, width: f32, lines: &[Vec<Point>]) {
        let mut path = GraphicsPath::new();
        for line in lines.iter().filter(|l| l.len() >= 2) {
            path.move_to(self.pt(line[0]));
            for &p in &line[1..] {
                path.line_to(self.pt(p));
            }
        }
        if !path.is_empty() {
            let pen = Pen::new(color(c), width).with_caps(LineCap::Round).with_join(LineJoin::Round);
            self.g.draw_path(&pen, &path);
        }
    }

    fn stroke_polygons(&mut self, c: Rgba, width: f32, polygons: &[Vec<Vec<Point>>]) {
        let path = self.rings(polygons);
        if !path.is_empty() {
            self.g.draw_path(&Pen::new(color(c), width), &path);
        }
    }
}

/// The tiles of one source covering the view: their level, size on screen and positions, nearest the centre first.
struct Grid {
    z: u8,
    ts: f32,
    tiles: Vec<(TileKey, f32, f32)>,
}

fn grid(view: &MapView, b: Rect, source: Source) -> Grid {
    let (w, h) = (f64::from(b.right - b.left), f64::from(b.bottom - b.top));
    // A 256-px tile at level z+1 covers what a 512-px one does at z: pick the level shown at ≥ 1:1 (crisp), capped
    // at the deepest the source has (deeper views over-zoom it).
    let level = view.zoom + (512.0 / source.tile_size()).log2();
    let z = (level.floor().max(0.0) as u8).min(source.max_zoom());
    let n = 1i64 << z;
    let ts = MapView::world_size(view.zoom) / n as f64;
    let (cx, cy) = view.center_px();
    let (left, top) = (cx - w / 2.0, cy - h / 2.0);
    let (x0, x1) = ((left / ts).floor() as i64, ((left + w) / ts).floor() as i64);
    let (y0, y1) = (((top / ts).floor() as i64).max(0), (((top + h) / ts).floor() as i64).min(n - 1));
    let (mx, my) = ((x0 + x1) as f64 / 2.0, (y0 + y1) as f64 / 2.0);
    let mut tiles: Vec<(f64, (TileKey, f32, f32))> = (y0..=y1)
        .flat_map(|ty| (x0..=x1).map(move |tx| (tx, ty)))
        .map(|(tx, ty)| {
            let key = (z, tx.rem_euclid(n) as u32, ty as u32);
            let ox = b.left + (tx as f64 * ts - left) as f32;
            let oy = b.top + (ty as f64 * ts - top) as f32;
            ((tx as f64 - mx).powi(2) + (ty as f64 - my).powi(2), (key, ox, oy))
        })
        .collect();
    tiles.sort_by(|a, b| a.0.total_cmp(&b.0));
    Grid { z, ts: ts as f32, tiles: tiles.into_iter().map(|t| t.1).collect() }
}

/// Draw one tile at `(ox, oy)`, `size` DIP wide; for an image, `src` is the part of it to stretch over that box.
#[allow(clippy::too_many_arguments)]
fn draw_tile(g: &Graphics<'_>, data: &TileData, layer: Layer, zoom: f32, ox: f32, oy: f32, size: f32, src: Option<Rect>) {
    match (data, layer) {
        (TileData::Vector(tile), Layer::Vector(palette)) => style::paint_tile(tile, zoom, palette, &mut D2dTile { g, ox, oy, size }),
        (TileData::Raster(path), _) => {
            let image = Image::from_file(path.to_string_lossy());
            g.draw_image_with(&image, Rect::new(ox, oy, ox + size, oy + size), src, 1.0);
        }
        _ => {}
    }
}

/// Where a place is on screen (the nearest copy of the world), if inside the view (with a margin for the markers).
fn project(view: &MapView, b: Rect, p: LngLat) -> Option<(f32, f32)> {
    let ws = MapView::world_size(view.zoom);
    let (cx, cy) = view.center_px();
    let mut dx = mercator_x(p[0]) * ws - cx;
    dx -= (dx / ws).round() * ws;
    let dy = mercator_y(p[1]) * ws - cy;
    let x = (b.left + b.right) / 2.0 + dx as f32;
    let y = (b.top + b.bottom) / 2.0 + dy as f32;
    let m = 40.0;
    (x > b.left - m && x < b.right + m && y > b.top - m && y < b.bottom + m).then_some((x, y))
}

/// The pin of the picked place, its tip at `(x, y)`: a red drop with a white heart and a soft shadow.
fn draw_pin(g: &Graphics<'_>, x: f32, y: f32) {
    let r = 11.0;
    let cy = y - 26.0;
    g.fill_ellipse(Brush::solid(Color::argb(0x40, 0, 0, 0)), Rect::new(x - 6.0, y - 2.5, x + 6.0, y + 2.5));
    let mut drop = GraphicsPath::new();
    drop.add_polygon(&[PointF::new(x - r * 0.82, cy + r * 0.58), PointF::new(x, y), PointF::new(x + r * 0.82, cy + r * 0.58)]);
    let red = Brush::solid(Color::rgb(0xd9, 0x30, 0x25));
    g.fill_path(red.clone(), &drop);
    g.fill_ellipse(red, Rect::new(x - r, cy - r, x + r, cy + r));
    g.fill_ellipse(Brush::solid(Color::rgb(0xff, 0xff, 0xff)), Rect::new(x - 4.0, cy - 4.0, x + 4.0, cy + 4.0));
}

/// A label placed on screen.
struct Placed {
    label: Label,
    x: f32,
    y: f32,
}

impl Control for MapCanvas {
    fn get_preferred_size(&self, _canvas: &dyn Canvas, proposed: Size) -> Size {
        proposed
    }

    fn on_paint(&mut self, e: &mut PaintEventCx<'_>) {
        let b = e.clip_rectangle;
        let Some(model) = self.model.clone() else {
            e.graphics.fill_rectangle(Brush::solid(color(style::background(&Palette::KUBUNO))), b);
            e.raise(self, "OnPaint");
            return;
        };
        let view = model.borrow().clone();
        let (layers, attribution) = Self::layers(view.basemap, view.labels);
        for (key, source, offline, _) in &layers {
            self.ensure_store(key, *source, *offline);
        }
        let g = e.graphics;
        let (w, h) = (b.right - b.left, b.bottom - b.top);
        let land = match layers.first() {
            Some((_, _, _, Layer::Vector(p))) => style::background(p),
            _ => Rgba::hex("#2b2f36"),
        };
        g.fill_rectangle(Brush::solid(color(land)), b);
        if w <= 0.0 || h <= 0.0 {
            return;
        }
        let state = g.save();
        g.set_clip(b);
        let zoom = view.zoom as f32;

        let mut drawn: Vec<(Arc<TileData>, f32, f32, f32)> = Vec::new();
        for (key, source, _, layer) in &layers {
            let Some(store) = self.stores.get(key) else { continue };
            let grid = grid(&view, b, *source);
            store.set_wanted(&grid.tiles.iter().map(|t| t.0).collect::<Vec<_>>());
            for &(tk, ox, oy) in &grid.tiles {
                if let Some(data) = store.tile(tk) {
                    draw_tile(g, &data, *layer, zoom, ox, oy, grid.ts, None);
                    if matches!(layer, Layer::Vector(_)) {
                        drawn.push((data, ox, oy, grid.ts));
                    }
                    continue;
                }
                // Stand-in: the nearest cached ancestor, scaled up and clipped to this tile.
                for k in 1..=ANCESTOR_LEVELS.min(grid.z) {
                    let parent = (grid.z - k, tk.1 >> k, tk.2 >> k);
                    let Some(data) = store.tile(parent) else { continue };
                    let (scale, mask) = ((1u32 << k) as f32, (1u32 << k) - 1);
                    let (sx, sy) = ((tk.1 & mask) as f32, (tk.2 & mask) as f32);
                    let inner = g.save();
                    g.set_clip(Rect::new(ox.max(b.left), oy.max(b.top), (ox + grid.ts).min(b.right), (oy + grid.ts).min(b.bottom)));
                    match &*data {
                        TileData::Vector(_) => draw_tile(g, &data, *layer, zoom, ox - sx * grid.ts, oy - sy * grid.ts, grid.ts * scale, None),
                        TileData::Raster(_) => {
                            // The part of the parent image this tile covers, stretched over it.
                            let part = 256.0 / scale;
                            let src = Rect::new(sx * part, sy * part, (sx + 1.0) * part, (sy + 1.0) * part);
                            draw_tile(g, &data, *layer, zoom, ox, oy, grid.ts, Some(src));
                        }
                    }
                    g.restore(inner);
                    break;
                }
            }
        }

        // The saved places (the one under the pin is the pin), under the labels.
        let marker_fill = Brush::solid(Color::rgb(0x1a, 0x73, 0xe8));
        let white = Brush::solid(Color::rgb(0xff, 0xff, 0xff));
        for &p in self.saved.iter().filter(|&&p| Some(p) != self.pin) {
            if let Some((x, y)) = project(&view, b, p) {
                g.fill_ellipse(white.clone(), Rect::new(x - 7.0, y - 7.0, x + 7.0, y + 7.0));
                g.fill_ellipse(marker_fill.clone(), Rect::new(x - 5.0, y - 5.0, x + 5.0, y + 5.0));
            }
        }

        // Labels of the vector basemaps, over every tile, most important first, never overlapping or cut.
        if view.labels {
            let culture = crate::Resources::culture();
            let lang = culture.split(['-', '_']).next().unwrap_or("en").to_ascii_lowercase();
            let palette = match layers.first() {
                Some((_, _, _, Layer::Vector(p))) => *p,
                _ => &Palette::KUBUNO,
            };
            let mut candidates: Vec<Placed> = drawn
                .iter()
                .filter_map(|(data, ox, oy, ts)| match &**data {
                    TileData::Vector(tile) => Some((tile, *ox, *oy, *ts)),
                    TileData::Raster(_) => None,
                })
                .flat_map(|(tile, ox, oy, ts): (&Tile, f32, f32, f32)| {
                    style::tile_labels(tile, zoom, palette, &lang)
                        .into_iter()
                        .map(move |label| Placed { x: ox + label.at[0] * ts, y: oy + label.at[1] * ts, label })
                })
                .filter(|p| p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom)
                .collect();
            candidates.sort_by_key(|p| p.label.priority);
            let format = StringFormat::default();
            // The pin comes first: a label never hides it.
            let mut taken: Vec<Rect> = self.pin_box(&view, b);
            let reserved = taken.len();
            for p in candidates {
                if taken.len() - reserved >= MAX_LABELS {
                    break;
                }
                let style = if p.label.bold { FontStyle::BOLD } else if p.label.italic { FontStyle::ITALIC } else { FontStyle::REGULAR };
                let font = Font::with_dip("Segoe UI", p.label.size, style);
                let size = g.measure_string(&p.label.text, &font, None, &format);
                let r = Rect::new(p.x - size.width / 2.0, p.y - size.height / 2.0, p.x + size.width / 2.0, p.y + size.height / 2.0);
                // Whole labels only: one cut by the map edge is left out.
                if r.left < b.left || r.right > b.right || r.top < b.top || r.bottom > b.bottom {
                    continue;
                }
                let pad = 4.0;
                if taken.iter().any(|t| r.left - pad < t.right && t.left < r.right + pad && r.top - pad < t.bottom && t.top < r.bottom + pad) {
                    continue;
                }
                let halo = Brush::solid(color(p.label.halo));
                for (dx, dy) in [(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0), (-1.0, -1.0), (1.0, 1.0), (-1.0, 1.0), (1.0, -1.0)] {
                    g.draw_string_at(&p.label.text, &font, halo.clone(), PointF::new(r.left + dx, r.top + dy));
                }
                g.draw_string_at(&p.label.text, &font, Brush::solid(color(p.label.color)), PointF::new(r.left, r.top));
                taken.push(r);
            }
        }

        // The picked place, over the labels.
        if let Some((x, y)) = self.pin.and_then(|p| project(&view, b, p)) {
            draw_pin(g, x, y);
        }

        // Offline: say why some areas stay empty.
        let format = StringFormat::default();
        if view.basemap == BaseMap::Offline {
            let font = Font::with_dip("Segoe UI", 12.0, FontStyle::REGULAR);
            let text = crate::Resources::offline_hint().to_string();
            let size = g.measure_string(&text, &font, None, &format);
            let chip = Rect::new(b.left + 12.0, b.top + 12.0, b.left + size.width + 32.0, b.top + size.height + 20.0);
            g.fill_rounded_rectangle(Brush::solid(Color::argb(0xee, 0xff, 0xff, 0xff)), chip, 8.0);
            g.draw_string_at(&text, &font, Brush::solid(Color::rgb(0x3c, 0x40, 0x43)), PointF::new(chip.left + 10.0, chip.top + 4.0));
        }

        // The data attribution, bottom-right, always on top.
        let font = Font::with_dip("Segoe UI", 11.0, FontStyle::REGULAR);
        let size = g.measure_string(&attribution, &font, None, &format);
        let chip = Rect::new(b.right - size.width - 14.0, b.bottom - size.height - 8.0, b.right - 4.0, b.bottom - 4.0);
        g.fill_rounded_rectangle(Brush::solid(Color::argb(0xd8, 0xff, 0xff, 0xff)), chip, 4.0);
        g.draw_string_at(&attribution, &font, Brush::solid(Color::rgb(0x5f, 0x63, 0x68)), PointF::new(chip.left + 5.0, chip.top + 2.0));

        g.restore(state);
        e.raise(self, "OnPaint");
    }

    fn on_mouse_down(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        if e.args().button == MouseButton::Left {
            self.drag = Some((e.args().x, e.args().y));
        }
    }

    fn on_mouse_move(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        let (x, y) = (e.args().x, e.args().y);
        let Some((lx, ly)) = self.drag else { return };
        self.drag = Some((x, y));
        if let Some(model) = &self.model {
            model.borrow_mut().pan_px(f64::from(x - lx), f64::from(y - ly));
        }
        self.camera_moved();
    }

    fn on_mouse_up(&mut self, _e: &mut EventCx<'_, MouseEventArgs>) {
        self.drag = None;
    }

    fn on_mouse_wheel(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        let a = *e.args();
        let s = self.size();
        if let Some(model) = &self.model {
            // Wheel up (negative notches, web convention) zooms in.
            model.borrow_mut().zoom_about(-f64::from(a.delta) * WHEEL_ZOOM, f64::from(a.x), f64::from(a.y), f64::from(s.width), f64::from(s.height));
        }
        self.camera_moved();
    }
}
