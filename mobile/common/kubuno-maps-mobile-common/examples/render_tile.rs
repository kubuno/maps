//! Render one vector tile with the native Kubuno basemap style (`kubuno_maps_core::style`) to a PNG - the same
//! style the desktop map draws, here rasterised with tiny-skia (geometry only; labels are drawn as anchor dots).
//!
//! `cargo run -p kubuno-maps-mobile-common --example render_tile -- <tile.pbf> <zoom> <out.png> [size]`

use kubuno_maps_core::mvt::{self, Point};
use kubuno_maps_core::style::{self, Palette, Rgba, TileCanvas};
use tiny_skia as sk;

struct Skia {
    pm: sk::Pixmap,
    size: f32,
}

impl Skia {
    fn paint(c: Rgba) -> sk::Paint<'static> {
        let mut p = sk::Paint::default();
        p.set_color_rgba8(c.r, c.g, c.b, c.a);
        p.anti_alias = true;
        p
    }

    fn path(&self, rings: impl Iterator<Item = (bool, impl Iterator<Item = Point>)>) -> Option<sk::Path> {
        let mut pb = sk::PathBuilder::new();
        for (close, ring) in rings {
            for (i, p) in ring.enumerate() {
                let (x, y) = (p[0] * self.size, p[1] * self.size);
                if i == 0 {
                    pb.move_to(x, y);
                } else {
                    pb.line_to(x, y);
                }
            }
            if close {
                pb.close();
            }
        }
        pb.finish()
    }
}

impl TileCanvas for Skia {
    fn fill_polygons(&mut self, color: Rgba, polygons: &[Vec<Vec<Point>>]) {
        if let Some(path) = self.path(polygons.iter().flatten().map(|r| (true, r.iter().copied()))) {
            self.pm.fill_path(&path, &Self::paint(color), sk::FillRule::EvenOdd, sk::Transform::identity(), None);
        }
    }

    fn stroke_lines(&mut self, color: Rgba, width: f32, lines: &[Vec<Point>]) {
        if let Some(path) = self.path(lines.iter().map(|l| (false, l.iter().copied()))) {
            let stroke = sk::Stroke { width, line_cap: sk::LineCap::Round, line_join: sk::LineJoin::Round, ..Default::default() };
            self.pm.stroke_path(&path, &Self::paint(color), &stroke, sk::Transform::identity(), None);
        }
    }

    fn stroke_polygons(&mut self, color: Rgba, width: f32, polygons: &[Vec<Vec<Point>>]) {
        if let Some(path) = self.path(polygons.iter().flatten().map(|r| (true, r.iter().copied()))) {
            let stroke = sk::Stroke { width, ..Default::default() };
            self.pm.stroke_path(&path, &Self::paint(color), &stroke, sk::Transform::identity(), None);
        }
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let tile_path = args.next().expect("usage: render_tile <tile.pbf> <zoom> <out.png> [size]");
    let zoom: f32 = args.next().and_then(|z| z.parse().ok()).expect("zoom");
    let out = args.next().expect("out.png");
    let size: u32 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1024);
    let tile = mvt::decode(&std::fs::read(tile_path).expect("read tile")).expect("decode");
    let mut canvas = Skia { pm: sk::Pixmap::new(size, size).expect("pixmap"), size: size as f32 };
    let bg = style::background(&Palette::KUBUNO);
    canvas.pm.fill(sk::Color::from_rgba8(bg.r, bg.g, bg.b, 255));
    style::paint_tile(&tile, zoom, &Palette::KUBUNO, &mut canvas);
    let labels = style::tile_labels(&tile, zoom, &Palette::KUBUNO, "fr");
    for l in labels.iter().take(40) {
        if let Some(dot) = sk::PathBuilder::from_circle(l.at[0] * canvas.size, l.at[1] * canvas.size, 3.0) {
            canvas.pm.fill_path(&dot, &Skia::paint(l.color), sk::FillRule::Winding, sk::Transform::identity(), None);
        }
    }
    canvas.pm.save_png(&out).expect("save");
    println!("{out}: {} labels (first: {:?})", labels.len(), labels.first().map(|l| &l.text));
}
