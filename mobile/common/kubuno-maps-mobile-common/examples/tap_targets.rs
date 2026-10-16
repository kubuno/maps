//! Print the tap targets of every screen - name, handler, editable field, centre in physical px - for a device size,
//! to script taps on a device or emulator (`adb shell input tap X Y`) from the real layout instead of guessed
//! coordinates:
//! `cargo run -p kubuno-maps-mobile-common --example tap_targets -- [width height [font.ttf]]` (default 1080×2340).

use kubuno_maps_mobile_common::{setup, VIEWS};
use kubuno_mobile_render::{view_hits, FontHandle};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let width = args.first().and_then(|w| w.parse().ok()).unwrap_or(1080);
    let height = args.get(1).and_then(|h| h.parse().ok()).unwrap_or(2340);
    let font = args.get(2).and_then(|p| std::fs::read(p).ok()).map(FontHandle::from_bytes);
    setup();
    for (i, view) in VIEWS.iter().enumerate() {
        println!("== view {i}");
        for hit in view_hits(view, width, height, font.as_ref(), None) {
            let (cx, cy) = (hit.rect.x + hit.rect.w / 2.0, hit.rect.y + hit.rect.h / 2.0);
            let handlers: Vec<String> = hit.events.iter().map(|(e, h)| format!("On{e}={h}")).collect();
            println!(
                "  {:<24} {:<5} centre=({:.0},{:.0}) {}",
                hit.name.as_deref().unwrap_or("-"),
                if hit.field.is_some() { "field" } else { "" },
                cx,
                cy,
                handlers.join(" ")
            );
        }
    }
}
