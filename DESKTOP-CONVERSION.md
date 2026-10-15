# Kubuno Maps — desktop conversion

Status: **started 2026-10-15** (foundations only). This document is the plan for the native Windows / Visual
Studio (Rust) desktop client of the Maps module. It follows the method already used for Documents and Calendar:
a sans-IO **shared core** (`common/core`, `kubuno-maps-core`) plus a **portable app** and **per-OS front ends**
under `desktop/{common,windows,…}`, with the Kubuno desktop framework pulled from the core repository by git
tag and linked statically.

The web app is the source of truth for behaviour: `web/src/` (notably `MapsPage.tsx`, `mapsLayers.ts`,
`mapsTheme.ts`, `mapOffline.ts`, `useNavigation.ts`, `navigation.ts`, `mapSketch.ts` / `useSketch.ts`,
`routing.ts`, `greatCircle.ts`, `MapsCosmos3D.tsx`). The server (`server/src/`) is unchanged by this work.

---

## 1. Layout

Mirrors **Drive** (the reference single-app module; per-platform layout, memory `repo-layout-platform-folders`):

```
maps/
├── common/core/                             kubuno-maps-core  (sans-IO shared engine)
├── server/                                  the module backend (unchanged)
├── web/                                     the web frontend (source of truth)
├── desktop/
│   ├── Cargo.toml                           the desktop Cargo workspace
│   ├── common/kubuno-maps-desktop-common/   the portable app (OS- and framework-free)
│   ├── windows/kubuno-maps-desktop/         the Win32 front end + kubuno-maps.exe
│   ├── linux/kubuno-maps-desktop-linux/     thin entry point (portable app, no Linux override yet)
│   └── macos/kubuno-maps-desktop-macos/     thin entry point (portable app, no macOS override yet)
└── mobile/                                  the Android/iOS app, laid out the same way (common/, android/, ios/;
                                             see mobile/README.md)
```

- The desktop workspace is **independent** of the server workspace (`server/Cargo.toml`).
- `common/core` is a plain crate consumed by path from the desktop workspace **and** compiled to `wasm32` for the
  web and via UniFFI for mobile later. It **is** a Visual Studio project (`Kubuno.Maps.Core.rsproj`, like Drive's
  `Kubuno.Drive.Core` and Office's `common/core`) — surfaced under the solution's `/Common/` folder.
- The Windows app crate is `kubuno-maps-desktop` (project `Kubuno.Maps.Desktop`), deriving its name from its
  folder like Drive's `kubuno-drive-desktop`; its binary stays `kubuno-maps.exe`.
- Framework crates (`kubuno-desktop*`) come from `git = kubuno/core, tag = desktop-v0.1.2-alpha`.

### Solution layout (`Kubuno.Maps.slnx`)

The solution folders map 1:1 to the disk folders, the same way Drive/Office/Core are organised
(`vskubuno/docs/SOLUTION-ALIGNMENT.md`): `/Common/` (the shared core), `/Server/`, `/Web/`,
`/Desktop/Common/` + `/Desktop/Windows/` (split, not a flat `/Desktop/`), and `/Mobile/`. Project display names
are `PascalCase` derived from each crate folder (`kubuno-maps-core` → `Kubuno.Maps.Core`, `kubuno-maps-desktop`
→ `Kubuno.Maps.Desktop`). Each `.rsproj` is hand-editable and preserved by the VS "Kubuno: Generate Visual
Studio Projects" generator (idempotent, never overwrites a `.rsproj`).

---

## 2. Web feature inventory

The web page (`MapsPage.tsx`) orchestrates these surfaces:

| Area | Web source | Nature |
|---|---|---|
| Map canvas (vector + raster, 3D globe/terrain) | MapLibre GL, `mapsLayers.ts`, `mapsTheme.ts` | **the hard part** — see §4 |
| Search bar + dropdown + history | `MapsSearchBar`, `MapsSearchDropdown`, `searchRows.ts`, `geocoding.ts` | native UI + core/server |
| Basemap / overlays / labels switcher | `MapsLayersButton`, `MapsLayersPanel`, `mapsLayers.ts` | native UI + **core catalogue** |
| Place panel (header / info / reviews / actions / photos) | `MapsPlacePanel` and `MapsPlace*`, `MapsImageLightbox` | native UI + server |
| Places / collections / saved places | `MapsPlacesPanel`, `useSavedPlaces.ts`, `MapsSavePlaceModal` | native UI + server |
| Category chips + POI results (Overpass) | `MapsCategoryChips`, `MapsPoiResultsPanel`, `poi.ts` | native UI + server |
| Route panel (modes / fields / options / results / suggestions) | `MapsRoutePanel` and `MapsRoute*`, `routing.ts`, `useRouteModes.ts` | native UI + **core geometry** + server |
| Plane mode (great-circle) | `greatCircle.ts` | **core** |
| Turn-by-turn navigation + overlay | `useNavigation.ts`, `navigation.ts`, `MapsNavOverlay` | **core** (projection) + native overlay |
| Sketch / measure (distance, area, draw, annotate) | `useSketch.ts`, `mapSketch.ts`, `MapsSketchPanel`, `MapsPublicSketch` | **core geometry** + native UI + server |
| GPX import / tracks / elevation | `MapsGpxPanel`, `MapsElevationChart`, server `gpx` | native UI + server |
| Offline tiles ("download this area") | `mapOffline.ts` | **core tile math** + native cache |
| Mini map / location picker | `MiniMap`, `MapsLocationPicker`, `MapsAddressInput` | native UI + renderer |
| 3D solar system ("cosmos") | `MapsCosmos3D.tsx` (~100 KB, WebGL) | **deferred** — see §4 note |
| Settings | `MapsSettingsPage`, `userPrefs.ts` | native UI + server |
| Weather / traffic badges | `weather.ts`, `trafficStatus.ts` | native UI + server |

### What is shared core vs native desktop

- **Shared core (`kubuno-maps-core`, done for the pure maths this increment):**
  Web Mercator tile math (`tiles`), geodesic geometry — haversine, path length, polygon area, bearing, circle
  ring, great-circle arc, flight time (`geo`), the basemap/overlay catalogue (`basemap`), the map theme palette
  (`theme`), and the distance/area/duration formatters (`format`). Still to port into the core: the OSRM route
  parsing (`routing.ts parseOsrmRoute`), the navigation projection (`navigation.ts navigate` /
  `buildNavRoute` / `positionAtDistance`), and the sketch GeoJSON (de)serialisation (`mapSketch.ts`).
- **Native desktop (framework UI over the portable app):** every panel and control above, the map camera
  state (`desktop/common` `MapView`), the REST client to the server (saved places, routes, sketches, GPX,
  geocode, overpass — through the shell's token broker), and the tile cache for offline mode.
- **Server (unchanged):** geocoding (Nominatim), POI (Overpass), routing (OSRM), places / collections / reviews,
  GPX, sketches, tiles proxy, cosmos textures, geoip. Routes inventoried in `server/src/router/mod.rs`.

---

## 3. The map rendering problem (central decision)

The map canvas is the one surface a native front end cannot cheaply reproduce. The web uses **MapLibre GL JS**,
which gives, for free: the themed **vector** default basemap (`kbstyle://default` restyling OpenFreeMap
Liberty, `mapsTheme.ts`), raster basemaps (satellite, topo, offline), the hillshade/3D terrain and the globe
projection, all overlays (cycle, transit, precipitation radar), smooth label placement and road shields, and
the GPU sketch/route layers. Re-implementing that natively is a multi-month renderer project on its own.

Three realistic options were considered:

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **A. MapLibre Native via FFI** | Bind the C++ (or the emerging Rust) MapLibre Native into the framework and draw into its surface | Pixel-faithful; vector theming, 3D, overlays all free; **same engine the Maps Android app already uses** | Heavy C++/GL build per OS; non-trivial to compose with the framework's Direct2D/wgpu surface; large binary |
| **B. Native raster tiles in Rust** | Fetch raster tiles and paint them with the framework `Graphics` | Simple; works offline; no extra runtime | Loses the **vector theme**, labels, 3D, globe and vector overlays — a visibly inferior map; against the "same look as web" product rule |
| **C. WebView2 hosting MapLibre GL for the map surface only** | Embed a web view sized to the map area, run the exact web MapLibre code in it, drive it over a JS bridge; the rest of the UI (toolbar, search, panels) is native | **Fastest path to parity**; reuses the exact `kbstyle` theme, every overlay, terrain/globe and even the cosmos 3D; the desktop framework already hosts web surfaces (the `.kbview` designer uses WebView2, memory `mobile-kbview-vs-designer`) | A web view runtime per OS (WebView2 on Windows, WKWebView macOS, WebKitGTK Linux); a thin JS bridge to maintain; must respect the "same look on every Linux DE" rule for the surrounding chrome |

### Decision (2026-10-15): **100 % native rendering** — no web view

The owner ruled out any web view in the desktop app (and Tauri and its family — `wry`, `tao` — for good). The map
is drawn natively, from the **same data as the web**: the OpenFreeMap vector tiles (OpenMapTiles schema), decoded
and styled by the module's shared engine `kubuno-maps-core` (`mvt` = a dependency-free MVT decoder, `style` = the
Kubuno map theme applied to the OpenMapTiles layers, issuing calls on a renderer-agnostic `TileCanvas`), and
rasterised by the GPU through the framework's Direct2D `Graphics` (`desktop/windows/…/controls/map_canvas.rs`). The
download and the memory/disk cache are portable (`desktop/common/…/tile_store.rs`). The same `TileCanvas` style is
rasterised with tiny-skia on mobile (`mobile/common/…/examples/render_tile.rs`), so desktop and mobile share one
basemap style. 3D (extruded buildings, terrain, the cosmos view) will use the GPU through `wgpu`, the engine the
mobile renderer already presents with — never a web view. Options A and C above are superseded.

free inside the hosted surface, and it is **deferred** regardless until the 2D map parity milestones land.

---

## 4. Milestones

- **M0 — Foundations (this increment, done).** `common/core` (`kubuno-maps-core`) with the tile math, geodesic
  geometry, basemap/overlay catalogue, theme palette and formatters (unit-tested). `desktop/` workspace with the
  portable app (`kubuno-maps-desktop-common`: launch options, `MapView` state, sample data, platform extension
  points incl. `MapSurface`) and the Windows entry point (`kubuno-maps.exe`) falling back to a text host. Visual
  Studio solution updated (Desktop folder). `kubuno-maps-core` builds and tests green on the host.
- **M1 — Window shell.** The native Win32 window with the Kubuno shell chrome, the navigation toolbar, the
  search bar and the layers button/panel wired to the core catalogue and `MapView` (no live map yet). Finish
  porting `routing.ts`, `navigation.ts` and the sketch GeoJSON into the core.
- **M2 — Live map surface (native) — DONE 2026-10-15.** OpenFreeMap vector tiles decoded and styled by `kubuno-maps-core`, drawn with Direct2D, drag to pan, wheel to zoom about the pointer, labels (UI language, no overlap), attribution; was: embed the MapLibre web surface behind the `MapSurface` trait; render the
  themed default basemap, basemap switching, overlays and labels; connect pan/zoom to `MapView`.
- **M3 — Search, places, geocoding.** The REST client through the shell token broker; search + dropdown +
  history, place panel, saved places and collections, category chips + Overpass POI results.
- **M4 — Routing & navigation.** Route panel (all modes incl. plane/great-circle), route rendering on the
  surface, turn-by-turn navigation overlay driven by the core projection.
- **M5 — Sketch, measure, GPX, offline.** Sketch/measure tools (core geometry) with server persistence and
  sharing; GPX import/tracks/elevation; offline "download this area" using the core tile math and a native cache.
- **M6 — Settings, polish, packaging.** Settings page, weather/traffic badges, the app icon (web `MapsLogo`),
  dark theme, and the desktop packaging/release wiring. Cosmos 3D optionally surfaced.
- **M7 — Converge on MapLibre Native (Option A).** Replace the web-view surface with a native MapLibre engine
  shared with the Maps Android app, once the framework renderer supports it.

Per-OS entry points for Linux and macOS (`desktop/linux`, `desktop/macos`) are thin and follow once the Windows
front end stabilises, reusing `desktop/common` and the shared core unchanged.
