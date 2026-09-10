// Share link of a route: `/maps?route=lat,lng;lat,lng[;…]&mode=driving`.
// MapsPage reads it on load and reopens the route panel with those points.
import type { LatLng } from './routing'
import { ROUTE_MODES, type RouteMode } from './useRouteModes'

export const ROUTE_LINK_MAX_POINTS = 9

/** Share URL of the current route (only the points that are set). */
export function routeShareUrl(waypoints: (LatLng | null)[], mode: RouteMode): string {
  const pts = waypoints.filter((w): w is LatLng => w != null).slice(0, ROUTE_LINK_MAX_POINTS)
  const route = pts.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')
  return `${location.origin}/maps?route=${encodeURIComponent(route)}&mode=${mode}`
}

/** Parses `?route=…&mode=…`; null when absent or malformed (never throws). */
export function parseRouteLink(search: string): { waypoints: LatLng[]; mode: RouteMode | null } | null {
  const params = new URLSearchParams(search)
  const raw = params.get('route')?.trim()
  if (!raw) return null
  const waypoints: LatLng[] = []
  for (const part of raw.split(';').slice(0, ROUTE_LINK_MAX_POINTS)) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(part.trim())
    if (!m) return null
    const lat = Number(m[1]), lng = Number(m[2])
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    waypoints.push({ lat, lng })
  }
  if (waypoints.length < 2) return null
  const mode = params.get('mode')
  return { waypoints, mode: mode && (ROUTE_MODES as string[]).includes(mode) ? (mode as RouteMode) : null }
}
