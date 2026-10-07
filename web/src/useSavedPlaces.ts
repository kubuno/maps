// "Home" / "Work" shortcuts of the search overlay, persisted in the user's
// module preferences (`preferences.maps.home` / `.work` via `PATCH /me`) so they
// follow the user across devices.
import { useCallback } from 'react'
import { useModulePrefs } from './userPrefs'
import type { SearchResult } from './geocoding'

export type SavedPlaceKind = 'home' | 'work'

export interface SavedPlace {
  label: string
  lat:   number
  lng:   number
}

interface SavedPlacesPrefs extends Record<string, unknown> {
  home: SavedPlace | null
  work: SavedPlace | null
}

/** Defensive read: preferences are user-editable JSON, never trust the shape. */
function sanitize(v: unknown): SavedPlace | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Partial<SavedPlace>
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !isFinite(p.lat) || !isFinite(p.lng)) return null
  return { label: typeof p.label === 'string' ? p.label : '', lat: p.lat, lng: p.lng }
}

export function useSavedPlaces(): {
  home: SavedPlace | null
  work: SavedPlace | null
  setSaved: (kind: SavedPlaceKind, place: SavedPlace | null) => Promise<void>
} {
  const { prefs, update } = useModulePrefs<SavedPlacesPrefs>('maps', { home: null, work: null })
  const setSaved = useCallback(
    (kind: SavedPlaceKind, place: SavedPlace | null) => update({ [kind]: place } as Partial<SavedPlacesPrefs>),
    [update],
  )
  return { home: sanitize(prefs.home), work: sanitize(prefs.work), setSaved }
}

/** Subtitle of a saved place row: its address, else the coordinates. */
export function savedPlaceSubtitle(p: SavedPlace): string {
  return p.label || `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`
}

/** Turns a saved place into a search result so it can be selected like one. */
export function savedPlaceToResult(kind: SavedPlaceKind, p: SavedPlace, title: string): SearchResult {
  return {
    place_id:     `saved-${kind}`,
    display_name: p.label ? `${title}, ${p.label}` : title,
    lat:          String(p.lat),
    lon:          String(p.lng),
    osm_type:     null, osm_id: null, category: null, type: null, addresstype: null,
    address:      null, extratags: null, namedetails: { name: title },
  }
}
