//! The Kubuno basemap style for native renderers: which features of an OpenMapTiles vector tile are drawn, in which
//! order, with which colour of the Kubuno map theme ([`crate::theme`], the web's `mapsTheme.ts`) and which width at
//! which zoom — the native counterpart of the web's themed OpenFreeMap "Liberty" style.
//!
//! Renderer-agnostic and sans-IO: [`paint_tile`] walks a decoded [`Tile`] and issues drawing calls on a
//! [`TileCanvas`] the client implements (Direct2D on the desktop, tiny-skia on mobile). Geometry is handed over in
//! tile-normalised coordinates; widths and text sizes are in screen pixels at the *display* zoom, so a tile drawn
//! between two zoom levels still gets the right line widths.

use crate::mvt::{Geometry, Point, Tile};
use crate::theme;

/// An RGBA colour.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Rgba {
    /// A theme token (`#rrggbb`); a malformed token yields magenta so it shows up instead of panicking.
    pub fn hex(token: &str) -> Self {
        let h = token.trim_start_matches('#');
        let byte = |i: usize| h.get(i..i + 2).and_then(|s| u8::from_str_radix(s, 16).ok());
        match (h.len(), byte(0), byte(2), byte(4)) {
            (6, Some(r), Some(g), Some(b)) => Self { r, g, b, a: 255 },
            _ => Self { r: 255, g: 0, b: 255, a: 255 },
        }
    }

    pub fn with_alpha(self, a: u8) -> Self {
        Self { a, ..self }
    }
}

/// What a renderer provides to draw one tile. All geometry is tile-normalised (`0..=1`); the renderer owns the
/// transform from the tile to the screen.
pub trait TileCanvas {
    /// Fill polygons (each an exterior ring followed by its holes; holes are cut out).
    fn fill_polygons(&mut self, color: Rgba, polygons: &[Vec<Vec<Point>>]);
    /// Stroke line strings, `width` in screen pixels, round joins and caps.
    fn stroke_lines(&mut self, color: Rgba, width: f32, lines: &[Vec<Point>]);
    /// Stroke polygon outlines, `width` in screen pixels.
    fn stroke_polygons(&mut self, color: Rgba, width: f32, polygons: &[Vec<Vec<Point>>]);
}

/// A text label of the basemap, for the renderer to place after every tile's geometry (so a neighbouring tile never
/// paints over it), most important first.
#[derive(Debug, Clone, PartialEq)]
pub struct Label {
    pub text: String,
    /// The anchor, tile-normalised.
    pub at: Point,
    /// Text size in screen pixels.
    pub size: f32,
    pub color: Rgba,
    pub halo: Rgba,
    pub bold: bool,
    pub italic: bool,
    /// Lower is more important (drawn first, wins collisions).
    pub priority: u32,
}

/// The land colour under every tile (the style's background).
pub fn background(palette: &Palette) -> Rgba {
    Rgba::hex(palette.land)
}

/// Interpolate a value over `(zoom, value)` stops (linear between stops, clamped at both ends).
fn interp(z: f32, stops: &[(f32, f32)]) -> f32 {
    let Some(&(z0, v0)) = stops.first() else { return 0.0 };
    if z <= z0 {
        return v0;
    }
    for w in stops.windows(2) {
        let ((za, va), (zb, vb)) = (w[0], w[1]);
        if z <= zb {
            return va + (vb - va) * (z - za) / (zb - za);
        }
    }
    stops.last().map_or(0.0, |s| s.1)
}

fn polygons(geom: &Geometry) -> Option<&[Vec<Vec<Point>>]> {
    match geom {
        Geometry::Polygons(p) => Some(p),
        _ => None,
    }
}

fn lines(geom: &Geometry) -> Option<&[Vec<Point>]> {
    match geom {
        Geometry::Lines(l) => Some(l),
        _ => None,
    }
}

/// The colours a vector basemap is drawn with. [`Palette::KUBUNO`] is the Kubuno map theme (the web's default
/// basemap, `mapsTheme.ts`); [`Palette::LIGHT`] the pale « Clair » basemap (the web's OpenFreeMap Positron).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Palette {
    pub land: &'static str,
    pub urban: &'static str,
    pub commercial: &'static str,
    pub park: &'static str,
    pub wood: &'static str,
    pub grass: &'static str,
    pub pitch: &'static str,
    pub cemetery: &'static str,
    pub hospital: &'static str,
    pub school: &'static str,
    pub sand: &'static str,
    pub ice: &'static str,
    pub water: &'static str,
    pub aeroway: &'static str,
    pub building: &'static str,
    pub building_line: &'static str,
    pub boundary: &'static str,
    pub boundary_low: &'static str,
    pub rail: &'static str,
    pub motorway: theme::RoadColor,
    pub primary: theme::RoadColor,
    pub secondary: theme::RoadColor,
    pub minor: theme::RoadColor,
    pub path: &'static str,
    pub tunnel_motorway: theme::RoadColor,
    pub tunnel_primary: theme::RoadColor,
    pub tunnel_other: theme::RoadColor,
    pub text_place: &'static str,
    pub text_place_minor: &'static str,
    pub text_other: &'static str,
    pub text_water: &'static str,
    pub halo: &'static str,
}

impl Palette {
    /// The Kubuno map theme ([`crate::theme`], the web's `mapsTheme.ts`).
    pub const KUBUNO: Palette = {
        use theme::{land, road, text, tunnel};
        Palette {
            land: land::LAND,
            urban: land::URBAN,
            commercial: land::COMMERCIAL,
            park: land::PARK,
            wood: land::WOOD,
            grass: land::GRASS,
            pitch: land::PITCH,
            cemetery: land::CEMETERY,
            hospital: land::HOSPITAL,
            school: land::SCHOOL,
            sand: land::SAND,
            ice: land::ICE,
            water: land::WATER,
            aeroway: land::AEROWAY,
            building: land::BUILDING,
            building_line: land::BUILDING_LINE,
            boundary: land::BOUNDARY,
            boundary_low: land::BOUNDARY_LOW,
            rail: land::RAIL,
            motorway: road::MOTORWAY,
            primary: road::PRIMARY,
            secondary: road::SECONDARY,
            minor: road::MINOR,
            path: road::PATH,
            tunnel_motorway: tunnel::MOTORWAY,
            tunnel_primary: tunnel::PRIMARY,
            tunnel_other: tunnel::OTHER,
            text_place: text::PLACE,
            text_place_minor: text::PLACE_MINOR,
            text_other: text::OTHER,
            text_water: text::WATER,
            halo: text::HALO,
        }
    };

    /// The pale « Clair » basemap: greys and soft greens over an off-white land, white roads (Positron-like).
    pub const LIGHT: Palette = {
        use theme::RoadColor as R;
        Palette {
            land: "#f2f3f0",
            urban: "#ecedea",
            commercial: "#ecebe7",
            park: "#e3e9e1",
            wood: "#dde3dc",
            grass: "#e7ebe5",
            pitch: "#e3e8e1",
            cemetery: "#e2e6e0",
            hospital: "#efe9e9",
            school: "#edece7",
            sand: "#eeece6",
            ice: "#f5f7f8",
            water: "#c2c8ca",
            aeroway: "#e7e7e7",
            building: "#e4e4e3",
            building_line: "#d9d9d8",
            boundary: "#9e9cab",
            boundary_low: "#c4c3cc",
            rail: "#dcdcdc",
            motorway: R { fill: "#ffffff", casing: "#d4d4d4" },
            primary: R { fill: "#ffffff", casing: "#dadada" },
            secondary: R { fill: "#ffffff", casing: "#e0e0e0" },
            minor: R { fill: "#ffffff", casing: "#e7e7e7" },
            path: "#e3e3e3",
            tunnel_motorway: R { fill: "#f7f7f7", casing: "#e0e0e0" },
            tunnel_primary: R { fill: "#f7f7f7", casing: "#e3e3e3" },
            tunnel_other: R { fill: "#f7f7f7", casing: "#e8e8e8" },
            text_place: "#4a4a4a",
            text_place_minor: "#5c5c5c",
            text_other: "#7a7a7a",
            text_water: "#7c8c99",
            halo: "#ffffff",
        }
    };
}

/// The fill of a `landcover` / `landuse` / `park` class, if it is drawn.
fn area_fill(p: &Palette, layer: &str, class: &str) -> Option<&'static str> {
    Some(match (layer, class) {
        (_, "wood" | "forest") => p.wood,
        (_, "grass" | "meadow" | "farmland" | "wetland" | "scrub" | "heath") => p.grass,
        (_, "sand" | "beach") => p.sand,
        (_, "ice" | "glacier") => p.ice,
        ("park", _) | (_, "park" | "garden" | "zoo" | "recreation_ground") => p.park,
        (_, "cemetery" | "grave_yard") => p.cemetery,
        (_, "hospital") => p.hospital,
        (_, "school" | "college" | "university" | "education" | "kindergarten" | "library") => p.school,
        (_, "pitch" | "stadium" | "playground" | "track") => p.pitch,
        (_, "commercial" | "retail" | "industrial" | "garages") => p.commercial,
        (_, "residential" | "suburb" | "neighbourhood" | "quarter" | "railway" | "military") => p.urban,
        _ => return None,
    })
}

/// A road class's draw order (higher on top), fill/casing colours and width stops.
struct RoadStyle {
    order: u8,
    color: theme::RoadColor,
    width: &'static [(f32, f32)],
    min_zoom: f32,
}

fn road_style(p: &Palette, class: &str, tunnel: bool) -> Option<RoadStyle> {
    const MOTORWAY_W: &[(f32, f32)] = &[(5.0, 0.5), (10.0, 1.6), (14.0, 6.0), (18.0, 22.0)];
    const PRIMARY_W: &[(f32, f32)] = &[(7.0, 0.5), (10.0, 1.2), (14.0, 5.0), (18.0, 18.0)];
    const SECONDARY_W: &[(f32, f32)] = &[(9.0, 0.5), (12.0, 1.5), (14.0, 4.0), (18.0, 15.0)];
    const MINOR_W: &[(f32, f32)] = &[(12.0, 0.5), (14.0, 2.5), (18.0, 11.0)];
    const SERVICE_W: &[(f32, f32)] = &[(14.0, 0.8), (18.0, 6.0)];
    const PATH_W: &[(f32, f32)] = &[(14.0, 0.6), (18.0, 2.0)];
    let pick = |normal: theme::RoadColor, under: theme::RoadColor| if tunnel { under } else { normal };
    Some(match class {
        "motorway" | "trunk" => RoadStyle { order: 6, color: pick(p.motorway, p.tunnel_motorway), width: MOTORWAY_W, min_zoom: 4.0 },
        "primary" => RoadStyle { order: 5, color: pick(p.primary, p.tunnel_primary), width: PRIMARY_W, min_zoom: 7.0 },
        "secondary" | "tertiary" => RoadStyle { order: 4, color: pick(p.secondary, p.tunnel_other), width: SECONDARY_W, min_zoom: 9.0 },
        "minor" | "busway" => RoadStyle { order: 3, color: pick(p.minor, p.tunnel_other), width: MINOR_W, min_zoom: 12.0 },
        "service" | "track" | "raceway" => RoadStyle { order: 2, color: pick(p.minor, p.tunnel_other), width: SERVICE_W, min_zoom: 14.0 },
        "path" | "pedestrian" => RoadStyle {
            order: 1,
            color: theme::RoadColor { fill: p.path, casing: p.path },
            width: PATH_W,
            min_zoom: 15.0,
        },
        _ => return None,
    })
}

/// Draw one tile's geometry at display zoom `zoom` with `palette`, in the basemap's painting order: land cover and
/// land use, parks, water, buildings, boundaries, rails, then roads (all casings under all fills, minor roads under
/// major ones).
pub fn paint_tile(tile: &Tile, zoom: f32, palette: &Palette, canvas: &mut impl TileCanvas) {
    let pal = palette;
    // 1. Land cover, land use, parks.
    for name in ["landcover", "landuse", "park"] {
        if let Some(layer) = tile.layer(name) {
            for f in &layer.features {
                let class = layer.str(f, "class").unwrap_or(name);
                if let (Some(fill), Some(p)) = (area_fill(pal, name, class), polygons(&f.geometry)) {
                    canvas.fill_polygons(Rgba::hex(fill), p);
                }
            }
        }
    }
    // 2. Aeroways.
    if let Some(layer) = tile.layer("aeroway") {
        for f in &layer.features {
            if let Some(p) = polygons(&f.geometry) {
                canvas.fill_polygons(Rgba::hex(pal.aeroway), p);
            }
        }
    }
    // 3. Water: areas, then rivers and streams.
    let water = Rgba::hex(pal.water);
    if let Some(layer) = tile.layer("water") {
        for f in &layer.features {
            if layer.str(f, "brunnel") != Some("tunnel") {
                if let Some(p) = polygons(&f.geometry) {
                    canvas.fill_polygons(water, p);
                }
            }
        }
    }
    if let Some(layer) = tile.layer("waterway") {
        for f in &layer.features {
            let stops: &[(f32, f32)] = match layer.str(f, "class") {
                Some("river") => &[(8.0, 0.6), (12.0, 1.5), (16.0, 5.0), (18.0, 10.0)],
                Some("canal") => &[(12.0, 0.8), (16.0, 3.0), (18.0, 6.0)],
                _ => &[(13.0, 0.4), (16.0, 1.2), (18.0, 2.5)],
            };
            if zoom >= stops[0].0 - 0.5 {
                if let Some(l) = lines(&f.geometry) {
                    canvas.stroke_lines(water, interp(zoom, stops), l);
                }
            }
        }
    }
    // 4. Buildings.
    if zoom >= 13.0 {
        if let Some(layer) = tile.layer("building") {
            let (fill, edge) = (Rgba::hex(pal.building), Rgba::hex(pal.building_line));
            for f in &layer.features {
                if let Some(p) = polygons(&f.geometry) {
                    canvas.fill_polygons(fill, p);
                    if zoom >= 15.0 {
                        canvas.stroke_polygons(edge, 0.6, p);
                    }
                }
            }
        }
    }
    // 5. Administrative boundaries (countries, regions) — no maritime lines.
    if let Some(layer) = tile.layer("boundary") {
        for f in &layer.features {
            if layer.number(f, "maritime") == Some(1.0) {
                continue;
            }
            let (color, width) = match layer.number(f, "admin_level") {
                Some(l) if l <= 2.0 => (pal.boundary, interp(zoom, &[(3.0, 0.8), (10.0, 1.6)])),
                Some(l) if l <= 4.0 => (pal.boundary_low, interp(zoom, &[(5.0, 0.5), (10.0, 1.0)])),
                _ => continue,
            };
            if let Some(l) = lines(&f.geometry) {
                canvas.stroke_lines(Rgba::hex(color), width, l);
            }
        }
    }
    // 6. Transport: rails, then roads by class (casings first, then fills), lowest class first.
    if let Some(layer) = tile.layer("transportation") {
        let mut roads: Vec<(RoadStyle, &[Vec<Point>])> = Vec::new();
        for f in &layer.features {
            let Some(class) = layer.str(f, "class") else { continue };
            let Some(l) = lines(&f.geometry) else { continue };
            if matches!(class, "rail" | "transit") {
                if zoom >= 10.0 {
                    canvas.stroke_lines(Rgba::hex(pal.rail), interp(zoom, &[(10.0, 0.6), (16.0, 1.6)]), l);
                }
                continue;
            }
            let tunnel = layer.str(f, "brunnel") == Some("tunnel");
            if let Some(style) = road_style(pal, class, tunnel) {
                if zoom >= style.min_zoom {
                    roads.push((style, l));
                }
            }
        }
        roads.sort_by_key(|(s, _)| s.order);
        // Casings only once roads are wide enough to show them.
        for (style, l) in &roads {
            let w = interp(zoom, style.width);
            if zoom >= 11.0 && w >= 1.5 {
                canvas.stroke_lines(Rgba::hex(style.color.casing), w + 1.6, l);
            }
        }
        for (style, l) in &roads {
            canvas.stroke_lines(Rgba::hex(style.color.fill), interp(zoom, style.width), l);
        }
    }
}

/// A feature's name in `lang` (`name:fr`…), else its Latin-script name (`name:latin`), else its local `name`.
fn label_name<'a>(layer: &'a crate::mvt::Layer, f: &crate::mvt::Feature, lang: &str) -> Option<&'a str> {
    let localized = format!("name:{lang}");
    let found = [localized.as_str(), "name:latin", "name"].into_iter().find_map(|k| layer.str(f, k).filter(|s| !s.is_empty()));
    found
}

/// The labels of one tile at display zoom `zoom`: place names (country → hamlet) and water names, most important first, in
/// the UI language `lang` (`"fr"`, `"en"`…) where the data has it — else the Latin-script name, else the local name.
pub fn tile_labels(tile: &Tile, zoom: f32, palette: &Palette, lang: &str) -> Vec<Label> {
    let pal = palette;
    let halo = Rgba::hex(pal.halo);
    let mut out = Vec::new();
    if let Some(layer) = tile.layer("place") {
        for f in &layer.features {
            let (Some(name), Geometry::Points(points)) = (label_name(layer, f, lang), &f.geometry) else { continue };
            let Some(&at) = points.first() else { continue };
            let rank = layer.number(f, "rank").unwrap_or(10.0) as u32;
            // (class, base priority, size stops, minimum zoom, bold, colour)
            let (base, stops, min_zoom, bold, color): (u32, &[(f32, f32)], f32, bool, &str) = match layer.str(f, "class") {
                Some("country") => (0, &[(2.0, 11.0), (6.0, 16.0)], 2.0, true, pal.text_place),
                Some("state") => (30, &[(4.0, 10.0), (8.0, 13.0)], 4.0, false, pal.text_other),
                Some("city") => (10, &[(4.0, 11.0), (8.0, 14.0), (12.0, 20.0)], 4.0, true, pal.text_place),
                Some("town") => (40, &[(7.0, 10.0), (12.0, 14.0), (15.0, 17.0)], 7.0, false, pal.text_place),
                Some("village") => (60, &[(10.0, 10.0), (14.0, 13.0)], 10.0, false, pal.text_place_minor),
                Some("suburb") => (70, &[(11.0, 10.0), (15.0, 13.0)], 11.0, false, pal.text_other),
                Some("neighbourhood" | "quarter") => (80, &[(13.0, 10.0), (16.0, 12.0)], 13.0, false, pal.text_other),
                Some("hamlet" | "isolated_dwelling") => (90, &[(13.0, 9.5), (16.0, 11.5)], 13.0, false, pal.text_other),
                _ => continue,
            };
            if zoom < min_zoom {
                continue;
            }
            out.push(Label {
                text: name.to_string(),
                at,
                size: interp(zoom, stops),
                color: Rgba::hex(color),
                halo,
                bold,
                italic: false,
                priority: base + rank,
            });
        }
    }
    if let Some(layer) = tile.layer("water_name") {
        for f in &layer.features {
            let (Some(name), Geometry::Points(points)) = (label_name(layer, f, lang), &f.geometry) else { continue };
            if let Some(&at) = points.first() {
                out.push(Label {
                    text: name.to_string(),
                    at,
                    size: interp(zoom, &[(8.0, 10.0), (14.0, 13.0)]),
                    color: Rgba::hex(pal.text_water),
                    halo,
                    bold: false,
                    italic: true,
                    priority: 50,
                });
            }
        }
    }
    out.sort_by_key(|l| l.priority);
    out
}

/// The attribution every map drawn from these tiles must show.
pub const ATTRIBUTION: &str = "© OpenFreeMap © OpenMapTiles © OpenStreetMap";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mvt;

    const PARIS_Z11: &[u8] = include_bytes!("../tests/fixtures/paris-11-1037-704.pbf");

    /// Records what `paint_tile` asks for.
    #[derive(Default)]
    struct Record {
        fills: Vec<Rgba>,
        strokes: Vec<(Rgba, f32)>,
    }

    impl TileCanvas for Record {
        fn fill_polygons(&mut self, color: Rgba, _: &[Vec<Vec<Point>>]) {
            self.fills.push(color);
        }
        fn stroke_lines(&mut self, color: Rgba, width: f32, _: &[Vec<Point>]) {
            self.strokes.push((color, width));
        }
        fn stroke_polygons(&mut self, color: Rgba, width: f32, _: &[Vec<Vec<Point>>]) {
            self.strokes.push((color, width));
        }
    }

    #[test]
    fn hex_tokens_parse() {
        assert_eq!(Rgba::hex("#a6d5ea"), Rgba { r: 0xa6, g: 0xd5, b: 0xea, a: 255 });
        assert_eq!(Rgba::hex("oops").r, 255);
    }

    #[test]
    fn interpolation_is_clamped_and_linear() {
        let s = [(10.0, 1.0), (14.0, 5.0)];
        assert_eq!(interp(5.0, &s), 1.0);
        assert_eq!(interp(12.0, &s), 3.0);
        assert_eq!(interp(20.0, &s), 5.0);
    }

    #[test]
    fn paris_paints_water_parks_and_roads_in_theme_colours() {
        let tile = mvt::decode(PARIS_Z11).expect("decode");
        let mut rec = Record::default();
        paint_tile(&tile, 11.5, &Palette::KUBUNO, &mut rec);
        let water = Rgba::hex(theme::land::WATER);
        assert!(rec.fills.contains(&water), "the Seine and lakes are filled with the theme water colour");
        assert!(rec.fills.contains(&Rgba::hex(theme::land::WOOD)), "woods");
        let motorway = Rgba::hex(theme::road::MOTORWAY.fill);
        assert!(rec.strokes.iter().any(|(c, w)| *c == motorway && *w > 1.0), "motorways");
        // Fills come before strokes of the same colour family: the last stroke is a road fill, never a casing.
        let last = rec.strokes.last().expect("strokes").0;
        assert_ne!(last, Rgba::hex(theme::road::MOTORWAY.casing));
    }

    #[test]
    fn the_light_palette_paints_the_same_features_in_paler_colours() {
        let tile = mvt::decode(PARIS_Z11).expect("decode");
        let (mut kubuno, mut light) = (Record::default(), Record::default());
        paint_tile(&tile, 11.5, &Palette::KUBUNO, &mut kubuno);
        paint_tile(&tile, 11.5, &Palette::LIGHT, &mut light);
        assert_eq!(kubuno.fills.len(), light.fills.len(), "same features");
        assert!(light.fills.contains(&Rgba::hex(Palette::LIGHT.water)));
        assert!(!light.fills.contains(&Rgba::hex(Palette::KUBUNO.water)));
        assert_ne!(background(&Palette::LIGHT), background(&Palette::KUBUNO));
    }

    #[test]
    fn paris_is_the_most_important_label() {
        let tile = mvt::decode(PARIS_Z11).expect("decode");
        let labels = tile_labels(&tile, 11.0, &Palette::KUBUNO, "fr");
        let first = labels.first().expect("labels");
        assert_eq!(first.text, "Paris");
        assert!(first.bold && first.size > 14.0);
        assert!(labels.windows(2).all(|w| w[0].priority <= w[1].priority));
    }

    #[test]
    fn labels_follow_the_ui_language() {
        let tile = mvt::decode(PARIS_Z11).expect("decode");
        let places = tile.layer("place").expect("place");
        // A place whose French and English names differ in this tile, if any, is shown in the asked language.
        let differing = places.features.iter().find(|f| {
            let (fr, en) = (places.str(f, "name:fr"), places.str(f, "name:en"));
            fr.is_some() && en.is_some() && fr != en
        });
        if let Some(f) = differing {
            let fr = label_name(places, f, "fr").expect("fr");
            assert_eq!(Some(fr), places.str(f, "name:fr"));
            assert_eq!(label_name(places, f, "en"), places.str(f, "name:en"));
        }
        // An unknown language falls back to a name.
        assert!(places.features.iter().all(|f| places.str(f, "name").is_none() || label_name(places, f, "zz").is_some()));
    }
}
