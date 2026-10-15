//! What the window and the map canvas share: the map view state (camera + layers), behind one `Rc<RefCell<…>>`
//! so the toolbar's layers panel and the canvas see the same [`MapView`]. The state type itself is the portable
//! one from `desktop/common` (`kubuno_maps_desktop_common::state::MapView`); this module only wraps it for the
//! Windows front end and localises the basemap names shown in the UI.

use std::cell::RefCell;
use std::rc::Rc;

use kubuno_desktop::ui::graphics::Color;
use kubuno_maps_core::basemap::BaseMap;
use kubuno_maps_desktop_common::state::MapView;

use crate::Resources;

/// The shared map view state.
pub type Shared = Rc<RefCell<MapView>>;

/// Wraps a `MapView` so the window and the canvas share one instance.
pub fn shared(view: MapView) -> Shared {
    Rc::new(RefCell::new(view))
}

/// The localised display name of a basemap (the web's `MapsLayersPanel` labels), in the current UI culture.
pub fn basemap_label(basemap: BaseMap) -> String {
    match basemap {
        BaseMap::Default => Resources::bm_default(),
        BaseMap::Light => Resources::bm_light(),
        BaseMap::Terrain => Resources::bm_terrain(),
        BaseMap::Satellite => Resources::bm_satellite(),
        BaseMap::Offline => Resources::bm_offline(),
    }
    .to_string()
}

/// The web's surface and text tokens (`--color-*`) in the current theme, for the custom-drawn controls.
#[derive(Debug, Clone, Copy)]
pub struct UiPalette {
    pub surface: Color,
    pub hover: Color,
    pub selected: Color,
    pub border: Color,
    pub primary: Color,
    pub text_primary: Color,
    pub text_secondary: Color,
    pub text_tertiary: Color,
}

impl UiPalette {
    pub const LIGHT: UiPalette = UiPalette {
        surface: hex(0xffffff),
        hover: hex(0xf1f3f4),
        selected: hex(0xe8f0fe),
        border: hex(0xe0e0e0),
        primary: hex(0x1a73e8),
        text_primary: hex(0x444444),
        text_secondary: hex(0x5f6368),
        text_tertiary: hex(0x80868b),
    };

    pub const DARK: UiPalette = UiPalette {
        surface: hex(0x202124),
        hover: hex(0x35363a),
        selected: hex(0x394457),
        border: hex(0x5f6368),
        primary: hex(0x8ab4f8),
        text_primary: hex(0xe8eaed),
        text_secondary: hex(0x9aa0a6),
        text_tertiary: hex(0x80868b),
    };

    /// The palette of the app's current theme.
    pub fn current() -> UiPalette {
        if kubuno_desktop::Application::theme().mode == kubuno_desktop::ui::ThemeMode::Dark {
            Self::DARK
        } else {
            Self::LIGHT
        }
    }
}

/// An opaque colour from `0xRRGGBB`.
pub const fn hex(v: u32) -> Color {
    Color::rgb((v >> 16) as u8, (v >> 8) as u8, v as u8)
}
