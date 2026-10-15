//! # Kubuno Maps — the portable app (`desktop/common`)
//!
//! The complete Kubuno Maps desktop app that does not depend on an operating system: the launch options
//! ([`app::Options`]), the map view state ([`state::MapView`]), the offline sample dataset ([`sample`]) and the
//! platform extension points ([`platform`]). The native window and the map surface live in `desktop/windows`;
//! it registers its [`platform::Platform`] and runs this app through [`app::run`].
//!
//! Framework- and OS-free on purpose, so it builds for every target and its logic is unit-tested without a
//! window. The map engine is the shared core [`kubuno_maps_core`].

pub mod app;
pub mod places;
pub mod platform;
pub mod sample;
pub mod state;
pub mod tile_store;

pub use app::{run, Options, TextUi, PROGRAM};
pub use platform::{MapSurface, Platform, UiHost};
pub use state::MapView;
