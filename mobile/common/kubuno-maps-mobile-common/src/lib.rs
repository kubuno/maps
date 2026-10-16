//! Kubuno Maps for mobile — the complete app, portable (no OS, no window system).
//!
//! The app is a set of `.kbview` screens (`views/`, edited in Visual Studio like every Kubuno view) rendered by the
//! shared Kubuno mobile renderer (`kubuno-mobile-render`, core repository), plus the one control the renderer does
//! not draw itself: the interactive themed map, [`MapView`] (`controls/`), registered as a host control. The account
//! comes from the core: the shared sign-in screens (`kubuno-mobile-signin`) and the session (`kubuno-mobile-account`).
//! The Android and iOS entry points (`../android`, `../ios`) hand [`APP`] to the shared shell of their OS.

mod controls;

pub use controls::map_view::MapView;

use std::cell::RefCell;
use std::time::Duration;

use kubuno_mobile_account::{platform_store, spawn, Session};
use kubuno_mobile_render::{input_focus, post_ui, register_host_control, set_data, App, Scope, TapEvent};

/// The home screen: the full-screen map under the search bar and the explore sheet.
pub const HOME: &str = include_str!("views/home.kbview");
/// Directions: the route on the map and the transport modes.
pub const DIRECTIONS: &str = include_str!("views/directions.kbview");
/// The base map and overlay choices.
pub const LAYERS: &str = include_str!("views/layers.kbview");
/// Saved places, lists and tracks, under the signed-in account.
pub const LIBRARY: &str = include_str!("views/library.kbview");
/// Turn-by-turn navigation.
pub const NAVIGATION: &str = include_str!("views/navigation.kbview");
/// A place's card.
pub const PLACE: &str = include_str!("views/place.kbview");
/// Search with suggestions.
pub const SEARCH: &str = include_str!("views/search.kbview");
/// A recorded track.
pub const TRACK: &str = include_str!("views/track.kbview");

/// Where the shared sign-in screens start in [`VIEWS`].
const SIGNIN_FIRST: usize = 8;

/// Every screen: the app's own (the home screen first), then the shared sign-in screens of the core.
pub const VIEWS: &[&str] = &[
    HOME,
    DIRECTIONS,
    LAYERS,
    LIBRARY,
    NAVIGATION,
    PLACE,
    SEARCH,
    TRACK,
    kubuno_mobile_signin::SERVER,
    kubuno_mobile_signin::LOGIN,
    kubuno_mobile_signin::TOTP,
];

/// Which full-screen view is shown. [M4] grows this into the full `MapsViewModel` (selected place, directions,
/// navigation, library tabs…).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Screen {
    SignIn,
    Home,
    Search,
    Layers,
    Library,
}

/// The app state, on the UI thread (the shell runs `setup`, the events and the rendering on one thread). Every change
/// is published to the renderer's data context with [`publish`].
struct State {
    screen: Screen,
    session: Option<Session>,
    account_label: String,
    account_server: String,
    status: String,
    results: Vec<(String, String)>,
}

thread_local! {
    static STATE: RefCell<State> = const {
        RefCell::new(State {
            screen: Screen::SignIn,
            session: None,
            account_label: String::new(),
            account_server: String::new(),
            status: String::new(),
            results: Vec::new(),
        })
    };
}

fn screen() -> Screen {
    STATE.with(|s| s.borrow().screen)
}

fn set_screen(screen: Screen) {
    STATE.with(|s| s.borrow_mut().screen = screen);
}

/// Publish the app state to the views (`{Bind …}` / `Repeater`). While signing in, the shared sign-in publishes its
/// own data instead.
fn publish() {
    if screen() == Screen::SignIn {
        return;
    }
    let scope = STATE.with(|s| {
        let s = s.borrow();
        Scope::new()
            .set("account_label", s.account_label.clone())
            .set("account_server", s.account_server.clone())
            .set("status", s.status.clone())
            .list("results", s.results.iter().map(|(n, d)| Scope::new().set("name", n.clone()).set("detail", d.clone())).collect())
    });
    set_data(scope);
}

/// The index into [`VIEWS`] the current screen maps to (the shell renders this).
fn view_index() -> usize {
    match screen() {
        Screen::SignIn => SIGNIN_FIRST + kubuno_mobile_signin::view_index(),
        Screen::Home => 0,
        Screen::Layers => 2,
        Screen::Library => 3,
        Screen::Search => 6,
    }
}

/// Handle an event of the view on screen: while signing in, the shared sign-in handles it; otherwise a screen-opening
/// button moves to that screen (opening search focuses the field, which brings up the keyboard), the search field's
/// `OnSearch` runs the search, a back / close or a picked result returns home, and Sign out ends the session.
fn on_event(ev: &TapEvent) {
    if screen() == Screen::SignIn {
        kubuno_mobile_signin::handle(ev);
        return;
    }
    match ev.handler.as_str() {
        "open_search" => {
            set_screen(Screen::Search);
            input_focus("query");
            show_search(String::from("Saisissez un lieu ou une adresse, puis validez"), Vec::new());
        }
        "run_search" => start_search(ev.text.as_deref().unwrap_or_default()),
        "open_library" => set_screen(Screen::Library),
        "open_layers" => set_screen(Screen::Layers),
        "close" | "pick_result" => set_screen(Screen::Home),
        "sign_out" => sign_out(),
        _ => {}
    }
}

fn show_search(status: String, results: Vec<(String, String)>) {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.status = status;
        s.results = results;
    });
    publish();
}

/// Start a search for `query` (submitted from the search field). The loading line shows now; a worker thread then
/// returns the results and posts them back to the UI thread, which re-renders. [M4] replaces the simulated results with
/// the real `GET /api/v1/maps/geocode/search` through the session's API client.
fn start_search(query: &str) {
    let query = query.trim().to_string();
    if query.is_empty() {
        return show_search("Saisissez un lieu ou une adresse, puis validez".into(), Vec::new());
    }
    show_search(format!("Recherche de « {query} »…"), Vec::new());
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        post_ui(move || show_search(format!("Résultats pour « {query} »"), sample_results()));
    });
}

fn sample_results() -> Vec<(String, String)> {
    [
        ("Tour Eiffel", "Champ de Mars, 75007 Paris"),
        ("Musée du Louvre", "Rue de Rivoli, 75001 Paris"),
        ("Gare du Nord", "18 rue de Dunkerque, 75010 Paris"),
        ("Notre-Dame de Paris", "6 parvis Notre-Dame, 75004 Paris"),
        ("Parc des Buttes-Chaumont", "1 rue Botzaris, 75019 Paris"),
    ]
    .iter()
    .map(|(n, d)| (n.to_string(), d.to_string()))
    .collect()
}

// ── Account ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/// Show the shared sign-in screens; the session comes back to [`signed_in`].
fn begin_sign_in() {
    STATE.with(|s| s.borrow_mut().session = None);
    set_screen(Screen::SignIn);
    kubuno_mobile_signin::start("Kubuno Maps", signed_in);
}

/// A session is open (just signed in, or restored at launch): show the map and fetch the profile.
fn signed_in(session: Session) {
    log::info!("KUBUNO: Maps session for {} on {}", session.account.label, session.account.server);
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.account_label = session.account.label.clone();
        s.account_server = session.account.server.split_once("://").map_or(session.account.server.clone(), |(_, h)| h.into());
        s.session = Some(session);
        s.screen = Screen::Home;
    });
    publish();
    refresh_profile();
}

/// Fetch the user's profile through the session (`GET /api/v1/me`, refreshing the access token when needed): it keeps
/// the account name current and proves the session works. An expired session sends the user back to sign in.
fn refresh_profile() {
    let Some(session) = STATE.with(|s| s.borrow().session.clone()) else { return };
    spawn(async move {
        let result = session.me().await;
        post_ui(move || match result {
            Ok(user) => {
                log::info!("KUBUNO: profile OK ({})", user.label());
                STATE.with(|s| s.borrow_mut().account_label = user.label());
                publish();
            }
            Err(e) if e.is_session_expired() => {
                log::warn!("KUBUNO: the session has expired: sign in again");
                begin_sign_in();
            }
            // Offline or a server hiccup: the session stays, the last known name too.
            Err(e) => log::warn!("KUBUNO: profile not refreshed: {e}"),
        });
    });
}

/// Sign out: close the server session (best effort), forget the account here, back to the sign-in screens.
fn sign_out() {
    let Some(session) = STATE.with(|s| s.borrow_mut().session.take()) else { return begin_sign_in() };
    spawn(async move {
        let result = session.sign_out(platform_store()).await;
        post_ui(move || {
            if let Err(e) = result {
                log::warn!("KUBUNO: sign-out: {e}");
            }
            log::info!("KUBUNO: signed out");
            begin_sign_in();
        });
    });
}

/// Register the app's host controls, then reopen the last session (or start the sign-in). The shell calls it once, on
/// its UI thread, after installing the OS secret store and before the first frame (through [`APP`]); a tool rendering
/// the views off-device calls it first too.
pub fn setup() {
    register_host_control("MapView", MapView::default());
    match Session::restore_last(platform_store()) {
        Ok(Some(session)) => signed_in(session),
        Ok(None) => begin_sign_in(),
        Err(e) => {
            log::error!("KUBUNO: cannot restore the session: {e}");
            begin_sign_in();
        }
    }
}

/// The Maps app, as the shells run it: its screens, the setup, and the navigation wiring (the shell asks
/// [`view_index`] which screen to show and hands events to [`on_event`]).
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
    fn a_launch_without_an_account_opens_the_sign_in() {
        setup();
        assert_eq!(screen(), Screen::SignIn);
        assert_eq!(view_index(), SIGNIN_FIRST, "the server screen of the shared sign-in");
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
