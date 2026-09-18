<!--
  SPDX-FileCopyrightText: 2026 Kubuno contributors
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

<div align="center">

<img src=".github/logo.png" alt="Kubuno Maps logo" width="120">

# Kubuno — Maps

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-edition_2021-orange.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)
![Status](https://img.shields.io/badge/status-alpha-yellow.svg)
![Kubuno module](https://img.shields.io/badge/Kubuno-module-4D38DB.svg)

**Self-hosted mapping for Kubuno — OpenStreetMap rendering, search and geocoding, saved places, routing and turn-by-turn navigation, and a built-in 3D view of the solar system.**

A module for [Kubuno](https://github.com/kubuno/core), the self-hosted, libre (AGPLv3) cloud platform — a sovereign alternative to the mainstream productivity suites.

</div>

---

## ✨ Features

- 🗺️ **Interactive OpenStreetMap mapping** — MapLibre GL rendering with server-side tile proxying, a Kubuno-themed basemap on top of the streamed style, plus light, terrain, satellite and offline basemaps. The layers control is a live map thumbnail that previews the alternative basemap.
- 🔎 **Search & geocoding** — a rounded search pill with keyboard-navigable suggestions (bold-matched, places near the current view first), forward and reverse geocoding through Nominatim, and de-duplicated results so a place is listed once.
- 📍 **Rich place details** — full-height place panel with hero photo, ratings computed from reviews left on Kubuno, tabs (Overview, Reviews, About, Tickets), quick actions, and category chips (restaurants, hotels, things to do, museums, transport, parking, pharmacies, ATMs…).
- ⭐ **Saved places & shortcuts** — Home and Work shortcuts, recent searches with full history, saved places, and a mini-panel for the shell's right rail. An "around here" card shows the town at the map centre and the current temperature (Open-Meteo, cached).
- 🧭 **Advanced routing & navigation** — a rebuilt directions panel with travel modes (Recommended, Car, Public transport, Walking, Bike, Plane), up to nine waypoints with drag-to-reorder, route options (avoid motorways, tolls, ferries; km/mi), "Leave now / Leave at / Arrive by", side-by-side route comparison and turn-by-turn navigation.
- 🌐 **Nearby POI discovery** — points of interest around a location via the Overpass API, toggleable instance-wide.
- ✏️ **Sketch & measurement tools** — draw points, lines and labels on the map and measure distances; sketches can be published as public shareable links (with an intermediate "existing links only" policy).
- 🥾 **GPX import** — import tracks with elevation profiles, subject to a configurable size cap.
- 🪐 **Cosmos — a 3D solar-system view** — a full Three.js scene: a real star catalogue with constellation lines and an 8K Milky Way panorama, a procedural Sun (glow, filament rays, magma flares, lens flare, total-eclipse corona), eight planets on real orbital data with atmospheres, ray-marched volumetric clouds, gas-giant differential rotation, cloud and ring shadows, and an asteroid belt. All assets are **self-hosted**: the backend serves equirectangular planet maps at multiple resolutions (256 px up to 8K), downscaling on demand into a disk cache with a pure-Rust image pipeline — never from a CDN. The view degrades gracefully when no textures are provisioned.
- 🔗 **Cross-module sharing** — places, routes and map views copy as portable JSON envelopes and paste as rich interactive cards (with a live mini-map preview) into other Kubuno modules such as Chat, and attach to the platform-wide Kubuno labels. Consumer modules resolve the card renderer dynamically through the core's extension point, so no module ever links against another.
- 🧰 **Services for other modules** — Maps owns geography for the whole platform: a GeoIP lookup service, a reusable `MiniMap` component, a `directionsUrl` builder and a map-based latitude/longitude picker are published through the core's registries for any installed module to consume, degrading to plain fields when Maps is absent.
- 🔒 **Deep-linkable UI** — sidebar panels are addressable through the URL (`/maps/#tab/<id>`), so direct links and the browser Back button behave as expected.

## 🏗️ Architecture

Maps is a **separate process** (a standalone Rust binary listening on port **3115**) that registers with the [core](https://github.com/kubuno/core) at startup. The core proxies its routes (`/api/v1/maps/*`), distributes platform events to it and manages its lifecycle; it also serves the module's runtime-loaded React frontend bundle through the host import map.

- **Backend** — `src/`: Axum + SQLx (PostgreSQL, dedicated schema `maps`); migrations in `migrations/`.
- **Frontend** — `frontend/`: a React bundle built to `entry.js`, consuming `@kubuno/sdk`, `@kubuno/ui` (`@ui`) and `@kubuno/drive` from npm — resolved by the host at runtime via the import map, never re-bundled.

## 📥 Install

A Kubuno module is distributed as a single **`.kbpkg`** — a portable package that the Kubuno server installs by itself, the same file on Linux, Windows and macOS. It is not a system service and ships in no other format.

The easiest way to self-host a full Kubuno instance (core + every module) is the all-in-one **Docker image** (`ghcr.io/kubuno/kubuno`); see **[kubuno/docker](https://github.com/kubuno/docker)**. To install Maps into an existing instance, grab the `.kbpkg` from the [GitHub Releases](https://github.com/kubuno/maps/releases) and let the core unpack it — from the admin console's module marketplace, or offline from the CLI:

```bash
sudo kubuno modules:install kubuno-maps-<version>-<os>-<arch>.kbpkg
sudo systemctl restart kubuno            # the core loads the module on (re)start
```

## 🛠️ Build & development

**Requirements:** Rust ≥ 1.82, Node.js ≥ 24, PostgreSQL 16.

```bash
cargo build --release                      # → target/release/kubuno-maps
cd frontend && npm ci && npm run build     # → dist/{entry.js, entry.css}
bash build_kbpkg.sh                         # → dist/maps-<version>-<os>-<arch>.kbpkg
bash build_kbpkg.sh --install              # build, install into the module store and restart
```

### Cosmos assets

The planet texture packs for the 3D solar-system view are large binaries and are **not versioned** in this repository — only the small star/constellation catalogues (`cosmos/data/`) are. To ship textures, drop equirectangular maps (JPEG/PNG, up to 8K) into `cosmos/textures/` before packaging. At runtime the backend probes the installed module directory (override with the `[cosmos]` section of `config.toml`) and serves each map at the requested resolution, caching the downscaled tiers on disk. When no textures are found, the view degrades gracefully.

> Shared dependencies come from Kubuno — no `kubuno/core` checkout required:
> - **Rust** — shared crates via tagged git dependencies on `kubuno/core`.
> - **Frontend** — `@kubuno/sdk`, `@kubuno/ui`, `@kubuno/drive` from the `@kubuno` npm scope.

## 📦 Tech stack

Rust 2021 · Axum · Tokio · SQLx (PostgreSQL 16) — React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand · React Query · MapLibre GL · Three.js.

## 🤝 Contributing

Contributions are welcome. Please open an issue to discuss any significant change before submitting a pull request.

## 📄 License

[AGPL-3.0-or-later](LICENSE) © Kubuno contributors.
