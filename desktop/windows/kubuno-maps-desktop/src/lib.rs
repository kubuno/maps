//! Kubuno Maps for Windows - the Win32 window of the Maps module's desktop app, over the portable app of
//! desktop/common (`kubuno-maps-desktop-common`: the launch options, the map view state, the sample data) and
//! the shared engine (`kubuno-maps-core`, common/core: the tile math, the geodesic geometry, the basemap/overlay
//! catalogue, the theme palette and the formatters).
//!
//! The library holds everything the Visual Studio designer links to render the window:
//!
//! - `views/` - the main window [`MapsWindow`] with its navigation toolbar, its search bar and its layers panel;
//! - `controls/` - the custom-drawn map surface placeholder [`MapCanvas`] and the [`MapView`] it shares with the
//!   window (`controls::model`);
//! - `platform/` - the Windows overrides of the common extension points (the local zone offset).
//!
//! This increment (DESKTOP-CONVERSION.md M1) ships the window shell: a real framework window with the Kubuno
//! shell chrome, the navigation toolbar, the search bar and the layers panel wired to the core basemap/overlay
//! catalogue and the shared `MapView`. The live map *surface* (MapLibre via WebView2, Option C) lands in M2; the
//! body is a themed placeholder until then.

pub mod controls;
pub mod platform;
pub mod views;
mod windows_ui;

pub use controls::map_canvas::MapCanvas;
pub use views::maps_window::MapsWindow;
pub use windows_ui::WindowsUi;

// `Resources::app_title()`… - the strings of `resources/resources.kbres` (neutral English) and
// `resources/resources.fr.kbres`, in the current UI culture; `{Res key}` in the view.
kubuno_desktop::resources!(pub Resources, "resources/resources.kbres");
