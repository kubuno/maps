//! Kubuno Maps for macOS: the app of desktop/common with the portable platform. macOS overrides nothing yet; a
//! native window and the macOS services join here as implementations of the extension points of
//! `kubuno_maps_desktop_common::platform` (see DESKTOP-CONVERSION.md, "Platform extension points").

use kubuno_maps_desktop_common::{app, platform::Platform};

fn main() {
    let mut platform = Platform::default();
    platform.name = "macos";
    std::process::exit(app::run(platform, &app::TextUi));
}
