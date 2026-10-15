// Offline tiles: a self-contained, isolated mechanism. A dedicated raster
// basemap ("Hors-ligne") loads its tiles through a custom `kbtile://` MapLibre
// protocol that is cache-first (Cache API), falling back to network and storing
// the result. "Download this area" pre-fills the cache for the visible bbox.
// Only the offline basemap uses the protocol — the other styles are untouched.

import type maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'

const CACHE = 'kubuno-maps-offline'
const TILE_BASE = 'https://tile.openstreetmap.org' // raster libre (usage modéré)
const MAX_TILES = 1500                              // garde-fou anti-téléchargement massif

// ── Tile math (Web Mercator / slippy map) ───────────────────────────────────────

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Enumerates {z,x,y} tiles covering a bbox over a zoom range (capped). */
export function tilesForBbox(
  bbox: [number, number, number, number],   // [w, s, e, n]
  minZoom: number,
  maxZoom: number,
): { z: number; x: number; y: number }[] {
  const [w, s, e, n] = bbox
  const out: { z: number; x: number; y: number }[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lonToTileX(Math.min(w, e), z), x1 = lonToTileX(Math.max(w, e), z)
    const y0 = latToTileY(Math.max(n, s), z), y1 = latToTileY(Math.min(n, s), z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        out.push({ z, x, y })
        if (out.length >= MAX_TILES) return out
      }
    }
  }
  return out
}

function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_BASE}/${z}/${x}/${y}.png`
}

// ── Cache API helpers ───────────────────────────────────────────────────────────

export async function cachedTileCount(): Promise<number> {
  try {
    const cache = await caches.open(CACHE)
    return (await cache.keys()).length
  } catch { return 0 }
}

export async function clearOfflineCache(): Promise<void> {
  try { await caches.delete(CACHE) } catch { /* ignore */ }
}

/** Pre-fetches tiles for a bbox into the cache, reporting progress. */
export async function downloadArea(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const tiles = tilesForBbox(bbox, minZoom, maxZoom)
  const cache = await caches.open(CACHE)
  let done = 0
  // Petits lots pour ne pas saturer le réseau / respecter la politique d'usage.
  const BATCH = 6
  for (let i = 0; i < tiles.length; i += BATCH) {
    await Promise.all(tiles.slice(i, i + BATCH).map(async tx => {
      const url = tileUrl(tx.z, tx.x, tx.y)
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { headers: { 'User-Agent': 'KubunoMaps/offline' } })
          if (res.ok) await cache.put(url, res.clone())
        }
      } catch { /* tuile ignorée */ }
      done++
      onProgress(done, tiles.length)
    }))
  }
  return tiles.length
}

// ── MapLibre protocol + offline raster style ────────────────────────────────────

let registered = false

/** Registers the cache-first `kbtile://` protocol (idempotent). */
export function registerOfflineProtocol(ml: typeof maplibregl): void {
  if (registered) return
  registered = true
  ml.addProtocol('kbtile', async (params: { url: string }) => {
    const real = params.url.replace(/^kbtile:\/\//, '')
    const cache = await caches.open(CACHE)
    let resp = await cache.match(real)
    if (!resp) {
      resp = await fetch(real)
      if (resp.ok) { try { await cache.put(real, resp.clone()) } catch { /* quota */ } }
    }
    const data = await resp.arrayBuffer()
    return { data }
  })
}

/** Raster style whose tiles go through the offline (cache-first) protocol. */
export function offlineRasterStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: [`kbtile://${TILE_BASE}/{z}/{x}/{y}.png`],
        attribution: '© OpenStreetMap (hors-ligne)',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  }
}
