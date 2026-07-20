<!--
  SPDX-FileCopyrightText: 2026 Kubuno contributors
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Kubuno Maps

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-edition_2021-orange.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![Module](https://img.shields.io/badge/Kubuno-module-4D38DB.svg)

**Kubuno Maps — cartographie self-hosted OpenStreetMap**

A module for [Kubuno](https://github.com/kubuno/core), the self-hosted, libre (AGPLv3) cloud platform.

## Features

- **Interactive OpenStreetMap mapping** — MapLibre GL rendering with tile proxying, search and geocoding, saved places, rich place details (photos, summaries, reviews), nearby POI discovery (Overpass), map layers, sketch and measurement tools, GPX import with elevation profiles, advanced routing and turn-by-turn navigation, and offline areas.
- **Cosmos: a 3D solar-system view** — a full Three.js scene built into the module: a real star catalog with constellation lines and an 8K Milky Way panorama, a fully procedural Sun (glow, filament rays, magma flares, lens flare, total-eclipse corona), eight planets on real orbital data with atmospheres, ray-marched volumetric clouds, gas-giant differential rotation, cloud and ring shadows, and an asteroid belt. All assets are **self-hosted**: the backend serves equirectangular planet maps at multiple resolutions (256 px up to 8K), downscaling on demand into a disk cache with a pure-Rust image pipeline, so the client streams exactly the level of detail each body needs — never from a CDN.
- **Cross-module sharing** — places, routes and map views can be copied as portable JSON envelopes and pasted as rich interactive cards (with a live mini-map preview) into other Kubuno modules such as Chat, and attached to the platform-wide Kubuno labels. Consumer modules resolve the card renderer dynamically through the core's extension point, so no module ever links against another.
- **Services for other modules** — Maps owns geography for the whole platform: a GeoIP lookup service and a reusable `MiniMap` component are published through the core's service registry for any installed module to consume.
- **Deep-linkable UI** — sidebar panels are addressable through the URL (`/maps/#tab/<id>`), so direct links and the browser Back button behave as expected.

## Architecture

A standalone Rust process that registers with the [core](https://github.com/kubuno/core) at startup; the core proxies its routes (`/api/v1/maps/*`) and serves its runtime-loaded React frontend bundle.

- **Backend** — `src/`: Axum + SQLx (PostgreSQL, schema `maps`); migrations in `migrations/`.
- **Frontend** — `frontend/`: a React bundle built to `entry.js`, consuming `@kubuno/sdk`, `@kubuno/ui` and `@kubuno/drive` from npm (provided by the host at runtime via the import map).

## Install

This module ships in the **all-in-one [Kubuno](https://github.com/kubuno/core) Docker image** (`ghcr.io/kubuno/kubuno`) — the easiest way to self-host a full Kubuno instance (core + every module). See **[kubuno/docker](https://github.com/kubuno/docker)** for `docker compose` instructions.

Native packages are also built for every tagged release and attached to the [GitHub Releases](https://github.com/kubuno/maps/releases): a **Debian package** (`.deb`), an **RPM** (Fedora/RHEL/openSUSE), a **Windows installer** (`.exe`, NSIS) and a **macOS package** (`.pkg`). Each installs the module into an existing Kubuno core installation.

To build this module from source, see below.

## Build

**Requirements:** Rust ≥ 1.82, Node.js ≥ 24, PostgreSQL 16.

```bash
cargo build --release                     # → target/release/kubuno-maps
cd frontend && npm ci && npm run build     # → dist/{entry.js, entry.css}
bash build_deb.sh                          # → dist/kubuno-maps_*.deb
```

Other platforms use the same auto-detecting layout as the `.deb`:

```bash
bash build_rpm.sh          # → dist/kubuno-maps-<ver>-1.<arch>.rpm   (needs rpmbuild)
bash build_windows.sh      # → dist/kubuno-maps-setup-<ver>-x64.exe  (NSIS; cargo-xwin to cross-compile from Linux)
bash build_macos.sh        # → dist/kubuno-maps-<ver>-arm64.pkg      (run on macOS)
```

### Cosmos assets

The planet texture packs for the 3D solar-system view are large binaries and are **not versioned** in this repository — only the small star/constellation catalogs (`cosmos/data/`) are. To ship textures, drop equirectangular maps (JPEG/PNG, up to 8K) into `cosmos/textures/` before packaging; `build_deb.sh` bundles them when present (the RPM/Windows/macOS scripts do not ship them — provision the textures on the server instead). At runtime the backend probes the installed module directory (override with the `[cosmos]` section of `config.toml`) and serves each map at the requested resolution, caching the downscaled tiers on disk. When no textures are found, the view degrades gracefully.

> Shared dependencies come from Kubuno — no `kubuno/core` checkout required:
> - **Rust** — shared crates via tagged git dependencies on `kubuno/core`.
> - **Frontend** — `@kubuno/sdk`, `@kubuno/ui`, `@kubuno/drive` from the `@kubuno` npm scope.

## License

[AGPL-3.0-or-later](LICENSE) © Kubuno contributors.
