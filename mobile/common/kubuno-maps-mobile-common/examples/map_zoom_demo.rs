//! Exercise the interactive MapView viewport (pan / pinch-zoom) without a device: render the Maps home screen at
//! a few zoom/pan states by driving the same gesture API the shells call.
//!
//! `cargo run -p kubuno-maps-mobile-common --example map_zoom_demo -- <font.ttf> <out-dir>`

use std::path::PathBuf;

use kubuno_maps_mobile_common::{setup, HOME};
use kubuno_mobile_render::{gesture_pan, gesture_reset, gesture_zoom, render_view, FontHandle};

fn main() {
    let mut args = std::env::args().skip(1);
    let font_path = args.next().expect("usage: map_zoom_demo <font.ttf> <out-dir>");
    let out = PathBuf::from(args.next().expect("usage: map_zoom_demo <font.ttf> <out-dir>"));
    let font = FontHandle::from_bytes(std::fs::read(&font_path).expect("read font"));
    std::fs::create_dir_all(&out).expect("create out dir");
    let (w, h) = (1080u32, 2340u32);
    let (wf, hf) = (w as f32, h as f32);

    // Register the MapView host control, as the shell does before the first frame.
    setup();

    let shot = |name: &str| {
        let pm = render_view(HOME, w, h, Some(&font), None).expect("render");
        pm.save_png(out.join(format!("{name}.png"))).expect("save");
        println!("{name}");
    };

    gesture_reset();
    shot("zoom-0-default");
    gesture_zoom(2.0, wf / 2.0, hf / 2.0, wf, hf);
    shot("zoom-1-in");
    gesture_zoom(2.0, wf / 2.0, hf / 2.0, wf, hf);
    shot("zoom-2-in-more");
    gesture_reset();
    gesture_zoom(0.4, wf / 2.0, hf / 2.0, wf, hf);
    shot("zoom-3-out");
    gesture_reset();
    gesture_pan(300.0, 200.0);
    shot("zoom-4-pan");
}
