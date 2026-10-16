# Map basemap snapshots

`map-L0.jpg` … `map-L6.jpg` are snapshots of the **Kubuno web basemap** - the OpenFreeMap "Liberty" vector style
restyled with the Kubuno theme (the same `applyTheme` pass as `maps/web/src/services/mapsTheme.ts`) - rendered with
MapLibre GL and captured at seven zoom levels around the same centre (central Paris), from L0 (widest, for panning)
to L6 (finest, for detail), half a zoom level apart, each a retina 2048 px JPEG (quality 72, ≈ 2.7 MB in all). The
`MapView` control (`../../controls/map_view.rs`) uses them as an interactive slippy map: it picks the finest level
covering the viewport and never upscales a raster, so zooming stays sharp. On a device the target is the native
MapLibre control loading that same style; these rasters are the offline stand-in. The geographic bounds of each
level (from MapLibre's `getBounds()` at capture time) are written next to it in `map_view.rs`.

`route.csv` is a route geometry (`lon,lat` per line) from **OSRM**, so it follows the real road network; the
`MapView` draws it, with origin/destination markers, when a screen sets `Route="true"`.

## Attribution & usage

- **Map data © OpenStreetMap contributors**, licensed under the **ODbL**. The `MapView` control draws this
  attribution over the map, on top of every overlay, so it is always visible.
- Basemap tiles are served by **OpenFreeMap** (free, no API key). The route geometry comes from the public
  **OSRM** demo server (OSM-derived data). Only a handful of requests were made to generate these snapshots - the
  OSM Foundation tile servers (`tile.openstreetmap.org`) are **not** used, in line with their tile usage policy.

To regenerate: a standalone MapLibre page with the ported Kubuno theme, captured in headless Chrome at each level
(the capture tooling is not part of the repository).
