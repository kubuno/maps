// Turn-by-turn navigation helpers: project a live position onto a route, derive
// the active maneuver, remaining distance/time, off-route detection, and a
// simulation cursor. Pure functions — the React glue lives in useNavigation.ts.

import { haversine } from './mapSketch'
import type { RouteResult, RouteStep } from './routing'

export interface NavRoute {
  coords:    [number, number][]   // [lng, lat] along the route
  cum:       number[]             // cumulative distance per vertex (m)
  total:     number               // total length (m)
  steps:     RouteStep[]
  stepIdx:   number[]             // nearest coords index for each step's maneuver
  durationS: number               // route duration (s) for ETA estimate
}

/** Pre-computes the structures needed to navigate a route. */
export function buildNavRoute(route: RouteResult): NavRoute | null {
  const coords = route.geometry?.coordinates
  if (!coords || coords.length < 2) return null
  const cum = new Array<number>(coords.length)
  cum[0] = 0
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i])
  const total = cum[cum.length - 1]
  // Map each step's maneuver location to the nearest vertex index.
  const stepIdx = route.steps.map(s => nearestIndex(coords, s.location).index)
  return { coords, cum, total, steps: route.steps, stepIdx, durationS: route.duration }
}

/** Nearest vertex index to a point, with distance to it (m). */
export function nearestIndex(coords: [number, number][], pos: [number, number]): { index: number; dist: number } {
  let best = 0, bestD = Infinity
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(coords[i], pos)
    if (d < bestD) { bestD = d; best = i }
  }
  return { index: best, dist: bestD }
}

/** Bearing a→b in degrees [0,360). */
export function bearing(a: [number, number], b: [number, number]): number {
  const φ1 = a[1] * Math.PI / 180, φ2 = b[1] * Math.PI / 180
  const Δλ = (b[0] - a[0]) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export interface NavState {
  index:          number          // nearest route vertex
  distToRoute:    number          // off-route distance (m)
  offRoute:       boolean
  stepIdx:        number          // active maneuver (index into steps)
  instruction:    string
  iconKey:        string
  distToManeuver: number          // m to next maneuver
  remaining:      number          // m to destination
  remainingTime:  number          // s to destination (estimate)
  arrived:        boolean
}

const OFF_ROUTE_M = 40
const ARRIVE_M = 25

/** Computes guidance for the current position against a route. */
export function navigate(nav: NavRoute, pos: [number, number]): NavState {
  const { index, dist } = nearestIndex(nav.coords, pos)
  const along = nav.cum[index]
  const remaining = Math.max(0, nav.total - along)

  // Active maneuver = first step whose vertex is at/after the current vertex.
  let stepIdx = nav.stepIdx.findIndex(si => si >= index)
  if (stepIdx === -1) stepIdx = nav.steps.length - 1
  const step: RouteStep | undefined = nav.steps[stepIdx]
  const maneuverAlong = nav.cum[nav.stepIdx[stepIdx]] ?? nav.total
  const distToManeuver = Math.max(0, maneuverAlong - along)

  const remainingTime = nav.total > 0 ? nav.durationS * (remaining / nav.total) : 0
  const arrived = remaining <= ARRIVE_M

  return {
    index,
    distToRoute: dist,
    offRoute: dist > OFF_ROUTE_M,
    stepIdx,
    instruction: step?.text ?? '',
    iconKey: step?.iconKey ?? 'straight',
    distToManeuver,
    remaining,
    remainingTime,
    arrived,
  }
}

/** Position (and bearing) at a given distance along the route — for simulation. */
export function positionAtDistance(nav: NavRoute, d: number): { pos: [number, number]; bearing: number } {
  const { coords, cum, total } = nav
  if (d <= 0) return { pos: coords[0], bearing: bearing(coords[0], coords[1] ?? coords[0]) }
  if (d >= total) return { pos: coords[coords.length - 1], bearing: bearing(coords[coords.length - 2] ?? coords[0], coords[coords.length - 1]) }
  let i = 1
  while (i < cum.length && cum[i] < d) i++
  const a = coords[i - 1], b = coords[i]
  const seg = cum[i] - cum[i - 1] || 1
  const f = (d - cum[i - 1]) / seg
  return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing: bearing(a, b) }
}
