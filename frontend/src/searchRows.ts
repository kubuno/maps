// Row building and Nominatim querying for the map search bar (kept out of the
// component so MapsSearchBar.tsx stays focused on state and rendering).
import type maplibregl from 'maplibre-gl'
import { mapNominatimResult, buildNominatimSearchUrl, type SearchResult } from './geocoding'
import type { HistoryEntry } from './MapsPlacesPanel'
import { fold, historyTitle, type SearchRow } from './MapsSearchDropdown'

export const RECENT_MAX = 5           // recent rows in the idle dropdown
export const RECENT_TYPING_MAX = 3    // history matches shown above suggestions while typing
export const SUGGESTIONS_MAX = 5      // geocoded suggestions while typing

/** Rows of the idle dropdown (input focused, nothing typed): shortcuts + recents. */
export function idleRows(
  saved: { home: SearchRow | null; work: SearchRow | null }, history: HistoryEntry[],
): SearchRow[] {
  const rows: SearchRow[] = []
  if (saved.work) rows.push(saved.work)
  if (saved.home) rows.push(saved.home)
  const seen = new Set<string>()
  for (const e of history) {
    const key = fold(historyTitle(e))
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ kind: 'history', entry: e })
    if (seen.size >= RECENT_MAX) break
  }
  if (history.length > 0) rows.push({ kind: 'more' })
  return rows
}

/** Rows while typing: matching history first, then geocoded suggestions. */
export function typingRows(q: string, history: HistoryEntry[], results: SearchResult[]): SearchRow[] {
  const fq = fold(q.trim())
  const rows: SearchRow[] = []
  const seen = new Set<string>()
  for (const e of history) {
    const title = historyTitle(e)
    const key = fold(title)
    if (seen.has(key) || !(key.includes(fq) || fold(e.query).includes(fq))) continue
    seen.add(key)
    rows.push({ kind: 'history', entry: e })
    if (seen.size >= RECENT_TYPING_MAX) break
  }
  for (const r of results) {
    // A suggestion identical to a recent entry is dropped: the recent one wins.
    const key = fold(r.namedetails?.name || r.display_name.split(',')[0].trim())
    if (seen.has(key)) continue
    rows.push({ kind: 'suggestion', result: r })
  }
  return rows
}

export type Viewbox = [number, number, number, number]   // west, north, east, south

/** Current map view, optionally widened by `factor` around its centre. */
export function mapViewbox(map: maplibregl.Map | null, factor = 1): Viewbox | undefined {
  if (!map) return undefined
  const b = map.getBounds(), c = b.getCenter()
  const hw = (b.getEast() - b.getWest()) / 2 * factor, hh = (b.getNorth() - b.getSouth()) / 2 * factor
  return [
    Math.max(-180, c.lng - hw), Math.min(90, c.lat + hh),
    Math.min(180, c.lng + hw),  Math.max(-90, c.lat - hh),
  ]
}

export async function fetchResults(url: string): Promise<SearchResult[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const raw: Array<Record<string, unknown>> = await res.json()
  return raw.map(mapNominatimResult)
}

/**
 * Nearby results first: one request restricted to the (widened) current view
 * and one worldwide, merged in that order and deduplicated by OSM identity.
 * The bounded request is optional — its failure never hides worldwide results.
 */
export async function searchNearbyFirst(query: string, map: maplibregl.Map | null, limit: number): Promise<SearchResult[]> {
  const wide = mapViewbox(map, 4), view = mapViewbox(map)
  const [near, world] = await Promise.all([
    wide ? fetchResults(buildNominatimSearchUrl(query, limit, wide, true)).catch(() => [] as SearchResult[]) : [],
    fetchResults(buildNominatimSearchUrl(query, limit, view, false)),
  ])
  const seen = new Set<string>()
  const merged: SearchResult[] = []
  for (const r of [...near, ...world]) {
    const key = r.osm_type && r.osm_id != null ? `${r.osm_type}/${r.osm_id}` : `p/${r.place_id}`
    if (seen.has(key)) continue
    seen.add(key); merged.push(r)
    if (merged.length >= limit) break
  }
  return merged
}

export function historyToResult(e: HistoryEntry): SearchResult {
  return {
    place_id:     `history-${e.id}`,
    display_name: e.result_name ?? e.query,
    lat:          String(e.result_lat),
    lon:          String(e.result_lng),
    osm_type:     null, osm_id: null, category: null, type: null, addresstype: null,
    address:      null, extratags: null, namedetails: null,
  }
}
