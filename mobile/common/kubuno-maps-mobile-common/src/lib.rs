//! Kubuno Maps for mobile — the complete app, portable (no OS, no window system).
//!
//! The app is a set of `.kbview` screens (`views/`, edited in Visual Studio like every Kubuno view) rendered by the
//! shared Kubuno mobile renderer (`kubuno-mobile-render`, core repository), plus the one control the renderer does
//! not draw itself: the interactive themed map, [`MapView`] (`controls/`), registered as a host control. The
//! Android and iOS entry points (`../android`, `../ios`) hand [`APP`] to the shared shell of their OS.

mod controls;

pub use controls::map_view::MapView;

use std::cell::Cell;

use std::time::Duration;

use kubuno_mobile_render::{input_focus, post_ui, register_host_control, set_data, App, Scope, TapEvent};

/// The home screen: the full-screen map under the search bar and the explore sheet.
pub const HOME: &str = include_str!("views/home.kbview");
/// Directions: the route on the map and the transport modes.
pub const DIRECTIONS: &str = include_str!("views/directions.kbview");
/// The base map and overlay choices.
pub const LAYERS: &str = include_str!("views/layers.kbview");
/// Saved places, lists and tracks.
pub const LIBRARY: &str = include_str!("views/library.kbview");
/// Turn-by-turn navigation.
pub const NAVIGATION: &str = include_str!("views/navigation.kbview");
/// A place's card.
pub const PLACE: &str = include_str!("views/place.kbview");
/// Search with suggestions.
pub const SEARCH: &str = include_str!("views/search.kbview");
/// A recorded track.
pub const TRACK: &str = include_str!("views/track.kbview");

/// Every screen, in a tap-to-advance order (the home screen first).
pub const VIEWS: &[&str] = &[HOME, DIRECTIONS, LAYERS, LIBRARY, NAVIGATION, PLACE, SEARCH, TRACK];

/// Which full-screen view is shown. This is the first slice of the app's navigation state; [DESKTOP/mobile M4] grows
/// it into the full `MapsViewModel` (selected place, directions, navigation, library tabs, search query…). The state
/// lives on the UI thread (the shell runs `setup`, the events and the rendering on one thread), like the host-control
/// registry.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Home,
    Search,
    Layers,
    Library,
}

thread_local! {
    static SCREEN: Cell<Screen> = const { Cell::new(Screen::Home) };
}

/// The index into [`VIEWS`] the current screen maps to (the shell renders this).
fn view_index() -> usize {
    match SCREEN.with(Cell::get) {
        Screen::Home => 0,
        Screen::Layers => 2,
        Screen::Library => 3,
        Screen::Search => 6,
    }
}

/// Handle a tap or a field submit: a screen-opening button moves to that screen (opening search focuses the field and
/// opens the keyboard); submitting the search field runs the search with what was typed; a back / close or picking a
/// result returns home.
fn on_event(ev: &TapEvent) {
    match ev.handler.as_str() {
        "open_search" => {
            SCREEN.with(|s| s.set(Screen::Search));
            // Focus the search field (the shell opens the soft keyboard); nothing is searched until it is submitted.
            input_focus("query", "", Some("run_search"));
            set_data(search_prompt_data());
        }
        "run_search" => start_search(ev.text.as_deref().unwrap_or_default()),
        "open_library" => SCREEN.with(|s| s.set(Screen::Library)),
        "open_layers" => SCREEN.with(|s| s.set(Screen::Layers)),
        "close" | "pick_result" => SCREEN.with(|s| s.set(Screen::Home)),
        _ => {}
    }
}

/// Start a search for `query` (the text submitted from the search field). The loading state shows now; a worker thread
/// then returns the results — as the Maps server call will — and posts them back to the UI thread, which re-renders.
/// [M4] replaces the sleep with the real `GET /geocode/search` through the account's Maps server.
fn start_search(query: &str) {
    let query = query.trim();
    if query.is_empty() {
        set_data(search_prompt_data());
        return;
    }
    set_data(loading_data(query));
    let query = query.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        post_ui(move || set_data(results_data(&query)));
    });
}

/// The data context for an open search field with nothing searched yet: a prompt and no results.
fn search_prompt_data() -> Scope {
    Scope::new().set("status", "Saisissez un lieu ou une adresse, puis validez").list("results", Vec::new())
}

/// The data context while the search for `query` is running: the loading line (echoing the query) and no results yet.
fn loading_data(query: &str) -> Scope {
    Scope::new().set("status", format!("Recherche de « {query} »…")).list("results", Vec::new())
}

/// The data context once the (here simulated) search for `query` has returned: the results the `Repeater` lists.
fn results_data(query: &str) -> Scope {
    Scope::new().set("status", format!("Résultats pour « {query} »")).list(
        "results",
        vec![
            place_scope("Tour Eiffel", "Champ de Mars, 75007 Paris"),
            place_scope("Musée du Louvre", "Rue de Rivoli, 75001 Paris"),
            place_scope("Gare du Nord", "18 rue de Dunkerque, 75010 Paris"),
            place_scope("Notre-Dame de Paris", "6 parvis Notre-Dame, 75004 Paris"),
            place_scope("Parc des Buttes-Chaumont", "1 rue Botzaris, 75019 Paris"),
        ],
    )
}

fn place_scope(name: &str, detail: &str) -> Scope {
    Scope::new().set("name", name).set("detail", detail)
}

/// Register the app's host controls with the renderer, reset the navigation state and install the initial data
/// context. The shell calls it once, on its UI thread, before the first frame (through [`APP`]); a tool rendering
/// the views off-device calls it first too.
pub fn setup() {
    register_host_control("MapView", MapView::default());
    SCREEN.with(|s| s.set(Screen::Home));
    set_data(search_prompt_data());
}

/// The Maps app, as the shells run it: its screens, the host-control setup, and the navigation wiring (the shell asks
/// [`view_index`] which screen to show and hands taps to [`on_event`]).
pub const APP: App =
    App { id: "maps", label: "Kubuno Maps", views: VIEWS, setup, on_event: Some(on_event), view_index: Some(view_index) };

#[cfg(test)]
mod tests {
    use super::*;
    use kubuno_mobile_render::render_view;

    #[test]
    fn every_screen_renders() {
        setup();
        for src in VIEWS {
            assert!(render_view(src, 1080, 2340, None, None).is_some());
        }
    }

    #[test]
    fn home_draws_the_map_full_bleed() {
        setup();
        let pm = render_view(HOME, 1080, 2340, None, None).expect("render");
        // Mid-screen sits on the map (the themed basemap snapshot), not on a flat white page.
        let p = pm.pixel(540, 1000).expect("pixel");
        assert!(!(p.red() == 0xff && p.green() == 0xff && p.blue() == 0xff), "the map is painted behind the overlays");
    }
}
