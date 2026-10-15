// Great-circle ("as the crow flies") geometry for the plane mode of the route
// panel. Nothing here is a flight plan: no airports, no schedules — only the
// shortest line over the sphere and an indicative time at cruise speed.
import type { LatLng, RouteResult } from './routing'

/** Indicative cruise speed used for the flight-time estimate (km/h). */
export const CRUISE_SPEED_KMH = 800
/** Segments per leg: enough for a smooth arc at any zoom without a heavy line. */
export const GREAT_CIRCLE_SEGMENTS = 64

const EARTH_RADIUS_M = 6_371_000
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Haversine distance in metres between two points. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Points of the great-circle arc from `a` to `b` as [lng, lat] pairs
 * (spherical linear interpolation on unit vectors). Longitudes are unwrapped
 * so a line crossing the antimeridian keeps going instead of jumping across
 * the map (MapLibre renders longitudes beyond ±180 continuously).
 */
export function greatCirclePoints(a: LatLng, b: LatLng, segments = GREAT_CIRCLE_SEGMENTS): [number, number][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng), φ2 = toRad(b.lat), λ2 = toRad(b.lng)
  const v1 = [Math.cos(φ1) * Math.cos(λ1), Math.cos(φ1) * Math.sin(λ1), Math.sin(φ1)]
  const v2 = [Math.cos(φ2) * Math.cos(λ2), Math.cos(φ2) * Math.sin(λ2), Math.sin(φ2)]
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]))
  const d = Math.acos(dot)
  // Coincident or antipodal points: no unique arc, draw the straight segment.
  if (d < 1e-9 || Math.abs(Math.PI - d) < 1e-9) return [[a.lng, a.lat], [b.lng, b.lat]]

  const out: [number, number][] = []
  let prevLng = a.lng
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d)
    const x = s1 * v1[0] + s2 * v2[0], y = s1 * v1[1] + s2 * v2[1], z = s1 * v1[2] + s2 * v2[2]
    let lng = toDeg(Math.atan2(y, x))
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))
    // Unwrap: stay within 180° of the previous point.
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    out.push([lng, lat])
    prevLng = lng
  }
  return out
}

/** Seconds of flight for `distanceM` metres at the indicative cruise speed. */
export function flightSeconds(distanceM: number): number {
  return distanceM / (CRUISE_SPEED_KMH * 1000 / 3600)
}

/**
 * A `RouteResult` for the plane mode: geodesic through every waypoint in
 * order, total straight-line distance, indicative duration, no maneuvers.
 */
export function greatCircleRoute(pts: LatLng[]): RouteResult {
  const coordinates: [number, number][] = []
  let distance = 0
  for (let i = 1; i < pts.length; i++) {
    const seg = greatCirclePoints(pts[i - 1], pts[i])
    coordinates.push(...(i === 1 ? seg : seg.slice(1)))
    distance += haversineM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng)
  }
  return {
    distance,
    duration: flightSeconds(distance),
    geometry: { type: 'LineString', coordinates },
    steps:    [],
  }
}
