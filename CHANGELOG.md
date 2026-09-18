# Changelog

All notable changes to **kubuno-maps** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/). Entries are added under
`[Unreleased]` **as the change is made**; `_tools/release.sh` stamps them under the version
number at release time, and CI publishes that section as the GitHub Release notes.

## [Unreleased]

### Security

- **HTTP/2 layer updated to a patched release.** `h2` moves from 0.4.15 to
  0.4.19, closing a denial of service through unbounded empty DATA frames
  (RUSTSEC-2026-0258).
- **Error library updated to a patched release.** `anyhow` moves from 1.0.102
  to 1.0.104, closing an unsoundness in `Error::downcast_mut()`
  (RUSTSEC-2026-0190).
- **TLS library updated to a patched release.** The pinned `rustls` carried
  RUSTSEC-2026-0285 (medium). Every outbound HTTPS connection goes through it.

## [0.1.7] - 2026-09-18

### Fixed

- **A map embedded in a page no longer steals the scroll wheel.** Scrolling
  towards the fields below a map sent the reader into orbit instead: the map
  caught every wheel turn passing over it. The wheel now zooms only once the map
  has been selected — its search field counts as much as the map itself, since
  naming a place and then zooming in on it is one gesture — and otherwise the
  page scrolls as if the map were a picture. The zoom buttons work either way.
  Applies to the location picker and to the small map this module lends to other
  parts of the product.
- **A place is now listed once.** Searching for an address could return the same
  line several times — "Paris, Île-de-France, France métropolitaine, France"
  twice over — because the geocoder answers with map objects, and one place is
  usually several of them: a boundary and a point, each with its own identity
  and the very same name. The list is now keyed on the name that is actually
  read. This applies everywhere the module searches: the route panel, the search
  bar and the location picker.

### Added

- **Pick a position on a map, in forms that belong to other parts of Kubuno.**
  Wherever the instance asks for a latitude and a longitude — the address of a
  building in the admin console, today — this module now offers a map instead of
  two number fields: search for the address, click to drop the pin, drag it to
  adjust. The coordinates stay editable by hand for anyone who already has them,
  and the plain fields come back if this module is removed.

### Changed

- **This module now installs as a Kubuno package (`.kbpkg`) only.** Its system
  packages (Debian/RPM and the Windows and macOS installers) are no longer
  built: the module is distributed as one `.kbpkg` per platform (Linux, Windows,
  macOS) that the Kubuno server installs itself — from the admin console, or
  offline with `kubuno modules:install <file>.kbpkg`.
- **A new look for the default map.** The default basemap now uses the Kubuno
  theme: near-white land, a soft grey urban mask with white streets, warm beige
  industrial and commercial areas, light green vegetation and teal-blue water.
  Motorways are drawn grey-blue, regional roads light grey-blue, and road
  numbers appear in colour-coded shields (red for motorways and national roads,
  yellow for departmental roads, green for European routes). Buildings are flat
  light-grey shapes at every zoom, and place labels are tinted by category
  (green for parks, orange for food, blue for shops and transit, red for
  health). The theme is applied on top of the streamed OpenFreeMap style, so
  the data source, the other basemaps (light, terrain, satellite, offline) and
  the overlays are unchanged.
- **The search bar is now a rounded pill with a directions shortcut.** The
  field sits in a white pill with a soft shadow; a search button and a
  directions button (diamond icon) live inside it. When a place is open, the
  pill shows its name with a clear button instead. Suggestions open attached
  under the pill in the same card, with keyboard navigation (arrow keys,
  Enter, Escape); the part of each name that matches what you typed is shown
  in bold, and places near the current view are listed first.
- **Category chips are now white pills with line icons.** The most useful
  categories come first (restaurants, hotels, things to do, museums, public
  transport, parking, pharmacies, ATMs); chips that do not fit in the row
  fold into a "More" menu. "Things to do" also finds theme parks, zoos and
  aquariums, and "Public transport" also finds subway entrances and stations.
- **The layers control is now a map thumbnail.** The bottom-left button shows
  a preview of the alternative basemap (satellite imagery while the map is
  shown, and vice versa) labelled "Layers", follows the map as you pan, and
  moves out of the way of the place panel.
- **The place panel fills the left side of the map.** It opens as a
  full-height white panel: hero photo under the search pill, larger title, a
  rating line computed from the reviews left on Kubuno, tabs (Overview,
  Reviews, About, and Tickets when the place has a booking link), five round
  actions, an expandable description card and icon-led information rows.


- **The README now opens with the module's logo.** The public README on
  GitHub now shows the module's designer logo (the same PNG shown as the
  browser tab icon and in the applications menu) at the top of the page — the
  repository landing now matches the icon a signed-in user sees inside the
  platform. The image ships in-repo, under `.github/logo.png`, so it renders
  even when the repo is browsed offline.

- **New Maps logo** — a hexagon with a red map pin over a green landscape,
  used as the browser-tab icon and in the applications menu. It is now raster
  (PNG) designer artwork.




### Added

- **Home and Work shortcuts** in the search dropdown, editable inline and
  saved with your account preferences; **recent searches** are listed under
  them, with a link to the full history, and they also match while you type.
- **An "around here" card** under the search dropdown shows the town at the
  centre of the map and the current temperature (from Open-Meteo, cached for
  ten minutes). A traffic line is ready in the card but stays hidden until a
  traffic data source is configured — no invented data.
- **"Send to your phone"** on a place shows a QR code of the place link,
  generated locally without any third-party service.
- **A share menu** on a place offers "Copy link" (with a confirmation
  message) and "Copy place card" for pasting into other modules.
- **A handle on the place panel's edge** collapses the whole left panel off
  the map and brings it back; the save button shows "Saved" when the place is
  already in your saved places.
- **The directions panel was rebuilt.** A travel-mode row (Recommended, Car,
  Public transport, Walking, Bike, Plane), stacked origin and destination
  fields with a connector column and a swap button, suggestions under the
  fields (your location, Home and Work, recent searches) and result cards
  with the mode icon, duration, distance and expected arrival time.
  "Recommended" compares car, bike and walking routes side by side, fastest
  first; each route can be picked from the panel or by clicking its line on
  the map (the chosen one is blue, the others grey). "Plane" draws the
  great-circle line with the straight-line distance and an indicative flight
  time. Public transport is shown but not available yet: Kubuno has no
  timetable source.
- **Up to nine points per route**: add destinations, drag stops to reorder
  them, remove them, or pick any point on the map.
- **Route options**: avoid motorways, tolls or ferries, and distance units
  (kilometres or miles, shared with the settings page). When the routing
  server does not support the requested exclusions, the panel says so and
  recomputes without them instead of pretending.
- **"Leave now", "Leave at…" and "Arrive by…"** show the expected arrival or
  departure time on each result. There is no traffic model, so the route
  itself does not change with the time.
- **Route actions**: send to a phone (QR code), copy link, print. A route link
  reopens the same route when the page loads.

### Fixed

- **The map no longer flickers to black while the window is resized.** During a
  resize the map's drawing surface was reallocated on every observer tick and,
  for one frame, the dark space background behind the globe showed through.
  Resizes are now coalesced to one per frame and the map is redrawn
  synchronously, so no empty frame is ever shown.

- **Selecting a search suggestion is now recorded in the search history.**
  The history was never populated because the map queried the geocoder
  directly; a selection is now recorded server-side as well.
- **Recent searches keep their coordinates.** The history endpoint reported
  them as empty (a numeric column was read with the wrong type), so a recent
  entry could not be reopened in one click. Entries without coordinates are
  now geocoded again on selection.
- **Search suggestions favour places near the current map view** instead of
  listing homonyms from the other side of the world first.
- **Sketch points and labels are drawn again.** The two map layers that show
  sketch points and text labels were declared with a filter the map engine
  rejects, so they were silently dropped (with an error in the browser console)
  every time the basemap loaded. They now render as intended.
- **A withdrawn dependency is no longer used.** A crate deep in the tree
  (`spin` 0.9.8, pulled in through the HTTP stack) was yanked by its authors.
  No vulnerability was announced, but a withdrawn crate has no business in a
  release; the lockfile now takes the version that replaced it.
- **The package could not be built where `zip` is absent.** The Windows job of
  the continuous integration has no `zip`, so the Windows package was simply lost
  the first time it was attempted — a script failure, not a build failure. The
  builder now falls back to 7-Zip, then to PowerShell.
### Added
- **Maps opens straight on the way to a place.** A link of the form `/maps?dest=<address>` opens the route panel with that address already set as the destination, so another part of Kubuno — the "Directions" button of a meeting invitation, for one — can hand over a destination without the reader retyping it.
- **`directionsUrl` service.** Maps now offers other modules a way to build that link. A module that wants to point at a place asks for the service and shows nothing when Maps is not installed, instead of hard-coding a route into it.

- **This module now ships a `.kbpkg`** — the single package format a Kubuno
  server installs by itself, the same file on Linux, Windows and macOS. It
  carries the same binary, interface and manifest as the system packages,
  arranged the way the server expects to find a module on disk, plus a
  `SHA256SUMS` so a copy carried offline can be checked without the catalogue.
  Nothing changes for existing installations: the `.deb`, `.rpm`, `.exe` and
  `.pkg` are still published, and a catalogue that sees both simply prefers the
  new one. It is also the only format the server can unpack without an external
  tool, which is what makes one-click installation possible away from
  Debian-like systems.
### Fixed

- **A built package could be thrown away instead of published.** The job that
  attaches a package to the release waited ten minutes for another workflow to
  create that release, then gave up with "release never appeared — build.yml
  likely failed". The diagnosis was wrong: on a repository whose `.deb` takes
  longer than ten minutes to build, the release simply did not exist yet, and a
  package that had built perfectly was discarded. Four modules reached v0.1.6
  with packages missing for some systems because of it. The job now creates the
  release itself when it is missing, so it no longer depends on another workflow
  finishing first.
### Added

- **Security policy and CI quality gate.** A `SECURITY.md` documents how to
  report vulnerabilities, and a CI workflow enforces `clippy -D warnings`, a
  dependency-vulnerability audit (`cargo audit`) and the frontend typecheck/tests.

## [0.1.6] - 2026-08-19

### Changed

- **Pill-shaped buttons are gone from the interface.** Filter chips, view
  segments, tab selectors and action buttons that were drawn as pills now use the
  same 4 px corner radius as every other button — the shape set them apart for no
  reason other than habit. Round buttons that hold a lone icon, avatars, status
  dots and non-clickable badges keep their shape: a circle around a single glyph
  is not a pill.

- Theme tokens: two colours for navigation labels (`--color-text-nav`,
  `--color-text-nav-active`). Every module carries the same token sheet, so the
  values must match across them — whichever bundle loads last would otherwise
  win. No visible change inside this module.

### Added

- A **mini-panel for the shell's right rail**: your saved places, one click from
  wherever you are.

### Changed

- Default application background token aligned with the core (`--body-bg` `#f8fafd`). Only
  visible when the module runs standalone: inside the shell the active theme sets it.

[Unreleased]: https://github.com/kubuno/maps/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/kubuno/maps/releases/tag/v0.1.7
[0.1.6]: https://github.com/kubuno/maps/releases/tag/v0.1.6
