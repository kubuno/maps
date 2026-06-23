// POI exploration — calls the module's Overpass proxy (`/maps/overpass/*`) to
// answer « what's around here » (restaurants, museums, cinemas, pharmacies…).
// The backend deduces a stable category id + emoji per result; here we only
// normalize a POI into the SearchResult shape so the existing place panel
// (MapsPlacePanel) can render its details (hours, phone, website, access…).

import { api } from '@kubuno/sdk'
import type { SearchResult } from './geocoding'

/** A point of interest returned by the Overpass proxy. */
export interface Poi {
  osm_type: string
  osm_id:   number
  lat:      number
  lng:      number
  name:     string | null
  category: string | null
  icon:     string | null
  tags:     Record<string, string>
}

/**
 * A user-facing category chip. Each maps to one or more backend category ids
 * (CSV passed to `/maps/overpass/nearby`). Grouping a few OSM categories under
 * one chip keeps the bar readable while staying exhaustive.
 */
export interface PoiChip {
  key:      string
  labelKey: string
  fallback: string
  emoji:    string
  cats:     string[]
}

// Order roughly follows everyday usefulness. `cats` reference ids declared in
// the backend catalogue (services/overpass_service.rs CATEGORIES).
export const POI_CHIPS: PoiChip[] = [
  { key: 'restaurants', labelKey: 'maps_cat_restaurants', fallback: 'Restaurants',     emoji: '🍽️', cats: ['restaurant', 'fast_food'] },
  { key: 'cafes',       labelKey: 'maps_cat_cafes',       fallback: 'Cafés',           emoji: '☕',  cats: ['cafe', 'bakery'] },
  { key: 'bars',        labelKey: 'maps_cat_bars',        fallback: 'Bars',            emoji: '🍺', cats: ['bar'] },
  { key: 'hotels',      labelKey: 'maps_cat_hotels',      fallback: 'Hôtels',          emoji: '🏨', cats: ['hotel'] },
  { key: 'museums',     labelKey: 'maps_cat_museums',     fallback: 'Musées',          emoji: '🏛️', cats: ['museum'] },
  { key: 'cinemas',     labelKey: 'maps_cat_cinemas',     fallback: 'Cinémas',         emoji: '🎬', cats: ['cinema', 'theatre'] },
  { key: 'activities',  labelKey: 'maps_cat_activities',  fallback: 'Activités',       emoji: '📸', cats: ['attraction', 'viewpoint', 'park', 'sport'] },
  { key: 'shops',       labelKey: 'maps_cat_shops',       fallback: 'Commerces',       emoji: '🛒', cats: ['supermarket'] },
  { key: 'pharmacies',  labelKey: 'maps_cat_pharmacies',  fallback: 'Pharmacies',      emoji: '💊', cats: ['pharmacy'] },
  { key: 'health',      labelKey: 'maps_cat_health',      fallback: 'Santé',           emoji: '🏥', cats: ['hospital', 'doctor'] },
  { key: 'atm',         labelKey: 'maps_cat_atm',         fallback: 'Distributeurs',   emoji: '🏧', cats: ['atm', 'bank'] },
  { key: 'fuel',        labelKey: 'maps_cat_fuel',        fallback: 'Carburant',       emoji: '⛽', cats: ['fuel', 'charging'] },
  { key: 'parking',     labelKey: 'maps_cat_parking',     fallback: 'Parkings',        emoji: '🅿️', cats: ['parking'] },
  { key: 'transit',     labelKey: 'maps_cat_transit',     fallback: 'Transports',      emoji: '🚏', cats: ['transit'] },
]

/** Fetches POIs of the given categories around a point (radius in meters). */
export async function fetchNearbyPois(
  lat: number, lng: number, radiusM: number, cats: string[], limit = 120,
): Promise<Poi[]> {
  const qs = new URLSearchParams({
    lat:        String(lat),
    lng:        String(lng),
    radius:     String(Math.round(radiusM)),
    categories: cats.join(','),
    limit:      String(limit),
  })
  const { data } = await api.get<{ count: number; results: Poi[] }>(
    `/maps/overpass/nearby?${qs.toString()}`,
  )
  return data.results ?? []
}

// Common OSM address keys carried in a POI's tags.
function poiAddress(tags: Record<string, string>): Record<string, string> {
  const a: Record<string, string> = {}
  if (tags['addr:housenumber']) a.house_number = tags['addr:housenumber']
  if (tags['addr:street'])      a.road         = tags['addr:street']
  if (tags['addr:city'])        a.city         = tags['addr:city']
  if (tags['addr:postcode'])    a.postcode     = tags['addr:postcode']
  if (tags['addr:country'])     a.country      = tags['addr:country']
  return a
}

/**
 * Adapts a POI to the SearchResult shape so MapsPlacePanel can render it.
 * The OSM tags already hold opening_hours, phone, website, cuisine, wheelchair…
 * which placeDetails() reads from `extratags`.
 */
export function poiToSearchResult(p: Poi): SearchResult {
  const tags = p.tags ?? {}
  // Pick the most descriptive type tag for the category label.
  const type = tags.amenity || tags.shop || tags.tourism || tags.leisure
    || tags.railway || tags.highway || p.category || null
  return {
    place_id:     `${p.osm_type}/${p.osm_id}`,
    display_name: p.name || 'Lieu sans nom',
    lat:          String(p.lat),
    lon:          String(p.lng),
    osm_type:     p.osm_type,
    osm_id:       p.osm_id,
    category:     p.category,
    type,
    addresstype:  null,
    address:      poiAddress(tags),
    extratags:    tags,
    namedetails:  p.name ? { name: p.name } : null,
  }
}
