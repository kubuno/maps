//! The Windows UI host.
//!
//! The target is a Win32 window painted through the Kubuno desktop framework: the navigation toolbar, the search
//! bar, the layers panel and the native map surface. This increment (DESKTOP-CONVERSION.md M1) opens that window
//! with the shell chrome and the toolbar / search / layers wired to the shared core and `MapView`; the live map
//! surface (M2) is still a themed placeholder (`MapCanvas`). An earlier fallback printed the opening view as
//! text - the window replaces it now that the shell lands.

use kubuno_maps_desktop_common::app::Options;
use kubuno_maps_desktop_common::platform::UiHost;

use crate::MapsWindow;

/// The Win32 window painted with the framework's `Graphics`.
pub struct WindowsUi;

impl UiHost for WindowsUi {
    fn run(&self, options: &Options) -> i32 {
        match run_window(options.clone()) {
            Ok(()) => 0,
            Err(e) => {
                kubuno_desktop::tracing::error!("[maps] {e:?}");
                1
            }
        }
    }
}

fn run_window(options: Options) -> kubuno_desktop::Result {
    kubuno_desktop::ui::diagnostics::set_display_name("Kubuno Maps");
    kubuno_desktop::resources::set_culture(&options.culture);
    if options.dark {
        kubuno_desktop::Application::set_theme(kubuno_desktop::ui::Theme::dark());
    }
    let window = MapsWindow::new(options);
    kubuno_desktop::Application::run(window)
}
