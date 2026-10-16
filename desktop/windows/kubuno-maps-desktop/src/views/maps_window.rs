//! Code-behind of Kubuno Maps' window (`maps_window.kbview`) - Windows Forms' `Form1.cs`.
//!
//! The window owns the shared map view state (the camera and the layer selection, `controls::model::Shared`,
//! which is the portable `MapView`) and turns the toolbar and the layers panel into moves of that state - the
//! web app's `MapsLayersButton` / `MapsLayersPanel` (`MapsPage.tsx`). Switching a basemap, toggling an overlay or
//! the labels updates the `MapView`; the map surface (`MapCanvas`) reads the same state and repaints.
//!
//! The search field and the places panel are the web's `MapsSearchBar` and saved places: typing searches (after a
//! short pause, on a worker thread, through the [`PlacesBackend`] - the Maps server of the account, or the offline
//! sample), the panel lists the results, a click flies the map there and drops a pin, « Save » keeps the picked
//! result among the saved places, which the panel lists when the field is empty and the map marks with dots.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use kubuno_desktop::prelude::*;
use kubuno_desktop::views::component::Control as _;

use kubuno_maps_core::basemap::{BaseMap, Overlay};
use kubuno_maps_core::geo::LngLat;
use kubuno_maps_core::tiles::{mercator_lat, mercator_lng};
use kubuno_maps_desktop_common::app::Options;
use kubuno_maps_desktop_common::places::{LiveBackend, Place, PlacesBackend, SampleBackend, SearchHit};
use kubuno_maps_desktop_common::state::MapView;
use kubuno_maps_desktop_common::tile_store::default_cache_dir;

use crate::controls::map_canvas::MapCanvas;
use crate::controls::model::{basemap_label, shared, Shared};
use crate::controls::result_list::{ItemPickedArgs, ResultList, ResultRow};
use crate::Resources;

/// How long the search waits for the typing to pause.
const SEARCH_DEBOUNCE: Duration = Duration::from_millis(350);
/// The zoom a picked place is shown at (a town, a street).
const PLACE_ZOOM: f64 = 16.0;
const CITY_ZOOM: f64 = 12.0;

/// Kubuno Maps' main window.
#[kubuno_desktop::view("maps_window.kbview")]
pub struct MapsWindow {
    #[control]
    canvas: Custom<MapCanvas>,
    #[control]
    results: Custom<ResultList>,
    /// The camera + layer state, shared with the map surface.
    model: Shared,
    /// Whether the layers panel is shown (the toolbar's « Layers » toggle).
    layers_shown: bool,
    /// Whether the places panel is shown (the toolbar's « My places » toggle).
    places_shown: bool,
    /// The offline sample instead of the account's server.
    sample: bool,
    backend: Option<Arc<dyn PlacesBackend>>,
    /// The last search's results, listed while the field holds a query.
    hits: Vec<SearchHit>,
    /// The account's saved places, listed when the field is empty.
    saved: Vec<Place>,
    /// Whether the list shows `hits` (else `saved`).
    showing_hits: bool,
    /// The result picked last (what « Save » keeps).
    picked: Option<SearchHit>,
    /// Where the pin is.
    pin: Option<LngLat>,
    /// Bumped by every keystroke: a search answer is shown only if no newer one was asked for.
    search_gen: Arc<AtomicU64>,
    /// A message replacing the status read-out (an error, a confirmation) until the next change.
    notice: Option<String>,
}

impl MapsWindow {
    pub fn new(options: Options) -> Self {
        let model = shared(options.view.clone());
        let mut window = Self { model, layers_shown: true, places_shown: true, sample: options.sample, ..Self::default() };
        window.initialize_component();
        window
    }

    /// The window is live: wire the map surface to the shared state, reflect the initial layer selection in the
    /// panel switches, load the saved places and paint the first status line.
    fn maps_window_load(&mut self) {
        let model = self.model.clone();
        self.canvas.with(|c| c.set_model(model.clone()));
        // The live basemap: tiles download in the background and each arrival repaints the map (posted to the UI
        // thread, at most one repaint pending at a time); a camera move made with the pointer refreshes the read-out.
        if let Some(dispatcher) = self.dispatcher() {
            let pending = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let post = dispatcher.clone();
            let notify = move || {
                if !pending.swap(true, Ordering::AcqRel) {
                    let pending = pending.clone();
                    drop(post.begin_invoke(move |w: &mut MapsWindow| {
                        pending.store(false, Ordering::Release);
                        w.canvas.with(|c| c.invalidate());
                    }));
                }
            };
            self.canvas.with(|c| {
                c.set_tile_source(default_cache_dir(), notify);
                c.set_on_camera(move || drop(dispatcher.begin_invoke(|w: &mut MapsWindow| w.refresh())));
            });
        }
        {
            let v = self.model.borrow();
            self.ov_cycle.set_checked(v.has_overlay(Overlay::Cycle));
            self.ov_relief.set_checked(v.has_overlay(Overlay::Relief));
            self.ov_terrain3d.set_checked(v.has_overlay(Overlay::Terrain3D));
            self.ov_transit.set_checked(v.has_overlay(Overlay::Transit));
            self.ov_precip.set_checked(v.has_overlay(Overlay::Precip));
            self.labels_switch.set_checked(v.labels);
        }
        self.layers_panel.set_visible(self.layers_shown);
        self.places_panel.set_visible(self.places_shown);

        let backend: Arc<dyn PlacesBackend> = if self.sample {
            Arc::new(SampleBackend::default())
        } else {
            LiveBackend::install_broker();
            Arc::new(LiveBackend)
        };
        self.backend = Some(backend);
        self.show_saved();
        self.load_saved();
        self.refresh();
    }

    // ── Toolbar ──────────────────────────────────────────────────────────────

    /// The « Layers » toggle: show or hide the layers panel (the web's `MapsLayersButton`).
    fn layers_toggle_click(&mut self) {
        self.layers_shown = !self.layers_shown;
        self.layers_panel.set_visible(self.layers_shown);
    }

    /// The « My places » toggle (and the panel's close button): show or hide the places panel.
    fn places_toggle_click(&mut self) {
        self.places_shown = !self.places_shown;
        self.places_panel.set_visible(self.places_shown);
    }

    /// The search field changed: after a pause in the typing, search on a worker thread and list the results; an
    /// emptied field lists the saved places again.
    fn search_changed(&mut self) {
        let query = self.search_box.get_text().trim().to_string();
        let gen = self.search_gen.fetch_add(1, Ordering::AcqRel) + 1;
        self.notice = None;
        if query.is_empty() {
            self.show_saved();
            self.refresh();
            return;
        }
        if !self.places_shown {
            self.places_shown = true;
            self.places_panel.set_visible(true);
        }
        let (Some(backend), Some(dispatcher)) = (self.backend.clone(), self.dispatcher()) else { return };
        let bounds = self.view_bounds();
        let lang = ui_lang();
        let latest = self.search_gen.clone();
        std::thread::spawn(move || {
            std::thread::sleep(SEARCH_DEBOUNCE);
            if latest.load(Ordering::Acquire) != gen {
                return;
            }
            let answer = backend.search(&query, bounds, &lang);
            drop(dispatcher.begin_invoke(move |w: &mut MapsWindow| {
                if w.search_gen.load(Ordering::Acquire) == gen {
                    w.show_hits(&query, answer);
                }
            }));
        });
        self.refresh();
    }

    // ── Places panel ────────────────────────────────────────────────────────────

    /// List a search's results (or say why there are none).
    fn show_hits(&mut self, query: &str, answer: Result<Vec<SearchHit>, String>) {
        self.showing_hits = true;
        self.picked = None;
        self.hits = match answer {
            Ok(hits) => hits,
            Err(e) => {
                tracing::error!("[maps] search failed: {e}");
                self.notice = Some(Resources::search_failed().to_string());
                Vec::new()
            }
        };
        let rows = self
            .hits
            .iter()
            .map(|h| ResultRow { icon: icon_for(h.category.as_deref()), title: h.name.clone(), detail: h.detail.clone() })
            .collect();
        self.places_title.set_text(Resources::results_title());
        let header = format!("« {query} »");
        self.results.with(|c| c.set_items(header, Resources::no_results(), rows));
        self.update_save_button();
        self.refresh();
    }

    /// List the saved places.
    fn show_saved(&mut self) {
        self.showing_hits = false;
        self.hits.clear();
        let rows = self
            .saved
            .iter()
            .map(|p| ResultRow { icon: "Star", title: p.name.clone(), detail: p.address.clone().unwrap_or_default() })
            .collect();
        self.places_title.set_text(Resources::saved_title());
        self.results.with(|c| c.set_items(Resources::pick_hint(), Resources::no_saved(), rows));
        self.update_save_button();
    }

    /// Fetch the saved places on a worker thread.
    fn load_saved(&mut self) {
        let (Some(backend), Some(dispatcher)) = (self.backend.clone(), self.dispatcher()) else { return };
        std::thread::spawn(move || {
            let answer = backend.saved();
            drop(dispatcher.begin_invoke(move |w: &mut MapsWindow| match answer {
                Ok(saved) => {
                    w.saved = saved;
                    w.update_markers();
                    if !w.showing_hits {
                        w.show_saved();
                    }
                }
                Err(e) => {
                    tracing::error!("[maps] saved places: {e}");
                    w.notice = Some(Resources::saved_failed().to_string());
                    w.refresh();
                }
            }));
        });
    }

    /// A row of the list was clicked: fly there and drop the pin.
    fn result_picked(&mut self, args: &ItemPickedArgs) {
        let target = if self.showing_hits {
            self.hits.get(args.index).map(|h| {
                self.picked = Some(h.clone());
                (h.location, h.name.clone(), zoom_for(h.category.as_deref()))
            })
        } else {
            self.picked = None;
            self.saved.get(args.index).map(|p| (p.location, p.name.clone(), PLACE_ZOOM))
        };
        let Some((location, name, zoom)) = target else { return };
        {
            let mut v = self.model.borrow_mut();
            v.center = location;
            v.zoom = zoom;
            v.clamp_zoom();
        }
        self.pin = Some(location);
        self.notice = Some(name);
        self.update_markers();
        self.update_save_button();
        self.refresh();
    }

    /// « Save »: keep the picked result among the saved places (on a worker thread).
    fn save_click(&mut self) {
        let Some(hit) = self.picked.clone() else { return };
        let (Some(backend), Some(dispatcher)) = (self.backend.clone(), self.dispatcher()) else { return };
        self.save_button.set_enabled(false);
        std::thread::spawn(move || {
            let answer = backend.save(&hit);
            drop(dispatcher.begin_invoke(move |w: &mut MapsWindow| {
                match answer {
                    Ok(place) => {
                        w.notice = Some(format!("{} - {}", place.name, Resources::saved_ok()));
                        w.saved.push(place);
                        w.update_markers();
                    }
                    Err(e) => {
                        tracing::error!("[maps] save place: {e}");
                        w.notice = Some(Resources::save_failed().to_string());
                    }
                }
                w.update_save_button();
                w.refresh();
            }));
        });
    }

    /// « Save » is available for a picked result that is not saved yet; a saved one reads « Saved ».
    fn update_save_button(&mut self) {
        let already = self.picked.as_ref().is_some_and(|h| self.is_saved(h));
        let can_save = self.showing_hits && self.picked.is_some() && !already;
        self.save_button.set_visible(self.showing_hits);
        self.save_button.set_enabled(can_save);
        self.save_button.set_text(if already { Resources::saved_already() } else { Resources::save() });
    }

    fn is_saved(&self, hit: &SearchHit) -> bool {
        self.saved.iter().any(|p| p.name == hit.name && (p.location[0] - hit.location[0]).abs() < 1e-6 && (p.location[1] - hit.location[1]).abs() < 1e-6)
    }

    /// Mark the saved places and the pin on the map.
    fn update_markers(&mut self) {
        let saved: Vec<LngLat> = self.saved.iter().map(|p| p.location).collect();
        let pin = self.pin;
        self.canvas.with(|c| c.set_markers(saved, pin));
    }

    /// The area the map shows, `[south, west, north, east]` (the search prefers it).
    fn view_bounds(&self) -> Option<[f64; 4]> {
        let size = self.canvas.with(|c| c.size())?;
        let v = self.model.borrow();
        let ws = MapView::world_size(v.zoom);
        let (cx, cy) = v.center_px();
        let (hw, hh) = (f64::from(size.width) / 2.0, f64::from(size.height) / 2.0);
        if hw <= 0.0 || hh <= 0.0 {
            return None;
        }
        let west = mercator_lng((cx - hw) / ws).max(-180.0);
        let east = mercator_lng((cx + hw) / ws).min(180.0);
        let north = mercator_lat((cy - hh) / ws);
        let south = mercator_lat((cy + hh) / ws);
        Some([south, west, north, east])
    }

    // ── Layers panel: base map ─────────────────────────────────────────────────

    fn basemap_default_click(&mut self) {
        self.set_basemap(BaseMap::Default);
    }

    fn basemap_light_click(&mut self) {
        self.set_basemap(BaseMap::Light);
    }

    fn basemap_terrain_click(&mut self) {
        self.set_basemap(BaseMap::Terrain);
    }

    fn basemap_satellite_click(&mut self) {
        self.set_basemap(BaseMap::Satellite);
    }

    fn basemap_offline_click(&mut self) {
        self.set_basemap(BaseMap::Offline);
    }

    fn set_basemap(&mut self, basemap: BaseMap) {
        self.model.borrow_mut().set_basemap(basemap);
        self.refresh();
    }

    // ── Layers panel: overlays + labels ─────────────────────────────────────────

    fn overlay_cycle_changed(&mut self) {
        let on = self.ov_cycle.is_checked();
        self.set_overlay(Overlay::Cycle, on);
    }

    fn overlay_relief_changed(&mut self) {
        let on = self.ov_relief.is_checked();
        self.set_overlay(Overlay::Relief, on);
    }

    fn overlay_terrain3d_changed(&mut self) {
        let on = self.ov_terrain3d.is_checked();
        self.set_overlay(Overlay::Terrain3D, on);
    }

    fn overlay_transit_changed(&mut self) {
        let on = self.ov_transit.is_checked();
        self.set_overlay(Overlay::Transit, on);
    }

    fn overlay_precip_changed(&mut self) {
        let on = self.ov_precip.is_checked();
        self.set_overlay(Overlay::Precip, on);
    }

    /// Bring the shared state's overlay in line with the switch, then repaint.
    fn set_overlay(&mut self, overlay: Overlay, on: bool) {
        {
            let mut v = self.model.borrow_mut();
            if v.has_overlay(overlay) != on {
                v.toggle_overlay(overlay);
            }
        }
        self.refresh();
    }

    fn labels_changed(&mut self) {
        let on = self.labels_switch.is_checked();
        self.model.borrow_mut().labels = on;
        self.refresh();
    }

    // ── Shared ───────────────────────────────────────────────────────────────

    /// Repaint the status line and the map surface from the current state.
    fn refresh(&mut self) {
        let status = match &self.notice {
            Some(notice) => notice.clone(),
            None => {
                let v = self.model.borrow();
                format!("{}   ·   z{:.1}", basemap_label(v.basemap), v.zoom)
            }
        };
        self.status_label.set_text(status);
        self.canvas.with(|c| c.invalidate());
    }
}

/// The UI language (`fr`, `en`…), for the place names.
fn ui_lang() -> String {
    let culture = Resources::culture();
    culture.split(['-', '_']).next().unwrap_or("en").to_ascii_lowercase()
}

/// The list icon of a place category (OSM class / type).
fn icon_for(category: Option<&str>) -> &'static str {
    match category.unwrap_or("") {
        "city" | "town" | "village" | "hamlet" | "suburb" | "administrative" | "place" | "boundary" => "Building2",
        "museum" | "theatre" | "monument" | "memorial" | "attraction" | "tourism" | "historic" => "Landmark",
        "tower" => "Castle",
        "church" | "cathedral" | "place_of_worship" => "Church",
        "station" | "railway" | "halt" => "TrainFront",
        "park" | "garden" | "forest" | "wood" | "leisure" => "Trees",
        "peak" | "mountain" | "natural" => "Mountain",
        _ => "MapPin",
    }
}

/// The zoom a picked result is shown at: a town whole, anything else up close.
fn zoom_for(category: Option<&str>) -> f64 {
    match category.unwrap_or("") {
        "city" | "town" | "administrative" | "boundary" => CITY_ZOOM,
        "village" | "suburb" => 14.0,
        _ => PLACE_ZOOM,
    }
}
