// Sketch engine: geometry helpers + GeoJSON (de)serialization + MapLibre
// rendering for user-drawn overlays (measure results, pins, lines, polygons,
// circles, text). Kept framework-agnostic; the React glue lives in useSketch.ts.

import type maplibregl from 'maplibre-gl'

export type SketchKind =
  | 'pin' | 'text' | 'line' | 'polygon' | 'circle'
  | 'measure-line' | 'measure-area'

export interface SketchFeature {
  id:      string
  kind:    SketchKind
  // [lng, lat] pairs. pin/text/circle store a single point (circle = center).
  coords:  [number, number][]
  color:   string
  label?:  string
  radius?: number            // meters, circle only
}

export const SKETCH_COLORS = ['#1a73e8', '#d93025', '#1e8e3e', '#f9ab00', '#9334e6', '#e8710a']

// ── Geometry ────────────────────────────────────────────────────────────────

const R = 6371000

export function haversine(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * Math.PI / 180
  const dLng = (b[0] - a[0]) * Math.PI / 180
  const la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Cumulative length of a polyline (meters). */
export function pathDistance(coords: [number, number][]): number {
  let d = 0
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i])
  return d
}

/** Geodesic area of a polygon ring (m²), using the spherical excess formula. */
export function polygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0
  const rad = Math.PI / 180
  let total = 0
  for (let i = 0; i < coords.length; i++) {
    const [lng1, lat1] = coords[i]
    const [lng2, lat2] = coords[(i + 1) % coords.length]
    total += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad))
  }
  return Math.abs(total * R * R / 2)
}

/** Destination point from origin given a bearing (deg) and distance (m). */
function destination(lng: number, lat: number, bearingDeg: number, distM: number): [number, number] {
  const d = distM / R
  const br = bearingDeg * Math.PI / 180
  const la1 = lat * Math.PI / 180, lo1 = lng * Math.PI / 180
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br))
  const lo2 = lo1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(la1),
    Math.cos(d) - Math.sin(la1) * Math.sin(la2),
  )
  return [lo2 * 180 / Math.PI, la2 * 180 / Math.PI]
}

/** Polygon approximation of a circle (closed ring). */
export function circleRing(center: [number, number], radiusM: number, steps = 64): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) ring.push(destination(center[0], center[1], (i / steps) * 360, radiusM))
  return ring
}

function centroid(coords: [number, number][]): [number, number] {
  const n = coords.length || 1
  const s = coords.reduce<[number, number]>((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0])
  return [s[0] / n, s[1] / n]
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtLen(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 2)} km` : `${Math.round(m)} m`
}

export function fmtArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`
  if (m2 >= 10_000)    return `${(m2 / 10_000).toFixed(2)} ha`
  return `${Math.round(m2)} m²`
}

// ── GeoJSON (de)serialization ───────────────────────────────────────────────

type GjFeature = {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

/** Serialize sketch features to a GeoJSON FeatureCollection (for persistence). */
export function toFeatureCollection(features: SketchFeature[]) {
  return {
    type: 'FeatureCollection',
    features: features.map<GjFeature>(f => {
      const props = { kind: f.kind, color: f.color, label: f.label ?? null, radius: f.radius ?? null, id: f.id }
      if (f.kind === 'pin' || f.kind === 'text' || f.kind === 'circle') {
        return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: f.coords[0] } }
      }
      if (f.kind === 'polygon' || f.kind === 'measure-area') {
        return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [f.coords] } }
      }
      return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: f.coords } }
    }),
  }
}

/** Parse a stored GeoJSON FeatureCollection back into sketch features. */
export function fromFeatureCollection(fc: unknown): SketchFeature[] {
  const obj = fc as { features?: GjFeature[] } | null
  if (!obj?.features) return []
  const out: SketchFeature[] = []
  obj.features.forEach((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>
    const kind = (p.kind as SketchKind) ?? 'line'
    const g = f.geometry
    let coords: [number, number][] = []
    if (g.type === 'Point') coords = [g.coordinates as [number, number]]
    else if (g.type === 'Polygon') coords = (g.coordinates as [number, number][][])[0] ?? []
    else if (g.type === 'LineString') coords = g.coordinates as [number, number][]
    out.push({
      id:     (p.id as string) ?? `f${i}`,
      kind,
      coords,
      color:  (p.color as string) ?? SKETCH_COLORS[0],
      label:  (p.label as string) ?? undefined,
      radius: (p.radius as number) ?? undefined,
    })
  })
  return out
}

// ── MapLibre rendering ────────────────────────────────────────────────────────

const SRC = 'sketch'
const DRAFT = 'sketch-draft'
type AnyMap = maplibregl.Map

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/** Render-ready FC: expands circles to rings and emits a label point per feature. */
function renderFC(features: SketchFeature[]) {
  const out: GjFeature[] = []
  for (const f of features) {
    if (f.kind === 'circle' && f.radius) {
      const ring = circleRing(f.coords[0], f.radius)
      out.push({ type: 'Feature', properties: { color: f.color, kind: f.kind }, geometry: { type: 'Polygon', coordinates: [ring] } })
      out.push(labelPoint(f, f.coords[0]))
      continue
    }
    if (f.kind === 'pin' || f.kind === 'text') {
      out.push({ type: 'Feature', properties: { color: f.color, kind: f.kind, isPoint: f.kind === 'pin' }, geometry: { type: 'Point', coordinates: f.coords[0] } })
      out.push(labelPoint(f, f.coords[0]))
      continue
    }
    if (f.kind === 'polygon' || f.kind === 'measure-area') {
      out.push({ type: 'Feature', properties: { color: f.color, kind: f.kind }, geometry: { type: 'Polygon', coordinates: [f.coords] } })
      out.push(labelPoint(f, centroid(f.coords)))
      continue
    }
    out.push({ type: 'Feature', properties: { color: f.color, kind: f.kind }, geometry: { type: 'LineString', coordinates: f.coords } })
    out.push(labelPoint(f, f.coords[f.coords.length - 1] ?? f.coords[0]))
  }
  return { type: 'FeatureCollection' as const, features: out }
}

function labelPoint(f: SketchFeature, at: [number, number]): GjFeature {
  return {
    type: 'Feature',
    properties: { label: f.label ?? '', color: f.color, isLabel: true },
    geometry: { type: 'Point', coordinates: at },
  }
}

/** Idempotently install the sketch sources + layers on a map. */
export function ensureSketchLayers(map: AnyMap) {
  if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: EMPTY })
  if (!map.getSource(DRAFT)) map.addSource(DRAFT, { type: 'geojson', data: EMPTY })

  if (!map.getLayer('sketch-fill')) {
    map.addLayer({
      id: 'sketch-fill', type: 'fill', source: SRC,
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
    })
  }
  if (!map.getLayer('sketch-line')) {
    map.addLayer({
      id: 'sketch-line', type: 'line', source: SRC,
      filter: ['in', '$type', 'Polygon', 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
    })
  }
  if (!map.getLayer('sketch-point')) {
    map.addLayer({
      id: 'sketch-point', type: 'circle', source: SRC,
      filter: ['all', ['==', '$type', 'Point'], ['==', ['get', 'isPoint'], true]],
      paint: {
        'circle-radius': 6, 'circle-color': ['get', 'color'],
        'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
      },
    })
  }
  if (!map.getLayer('sketch-label')) {
    map.addLayer({
      id: 'sketch-label', type: 'symbol', source: SRC,
      filter: ['all', ['==', '$type', 'Point'], ['==', ['get', 'isLabel'], true]],
      layout: {
        'text-field': ['get', 'label'], 'text-size': 12,
        'text-offset': [0, -1.4], 'text-anchor': 'bottom',
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#202124', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    })
  }
  // Draft (in-progress) — dashed line + vertices.
  if (!map.getLayer('sketch-draft-fill')) {
    map.addLayer({
      id: 'sketch-draft-fill', type: 'fill', source: DRAFT,
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
    })
  }
  if (!map.getLayer('sketch-draft-line')) {
    map.addLayer({
      id: 'sketch-draft-line', type: 'line', source: DRAFT,
      filter: ['in', '$type', 'Polygon', 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
    })
  }
  if (!map.getLayer('sketch-draft-point')) {
    map.addLayer({
      id: 'sketch-draft-point', type: 'circle', source: DRAFT,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 4, 'circle-color': '#fff',
        'circle-stroke-width': 2, 'circle-stroke-color': ['get', 'color'],
      },
    })
  }
}

function setData(map: AnyMap, id: string, data: unknown) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (src) src.setData(data as Parameters<maplibregl.GeoJSONSource['setData']>[0])
}

/** Push committed features to the map. */
export function renderSketch(map: AnyMap, features: SketchFeature[]) {
  ensureSketchLayers(map)
  setData(map, SRC, renderFC(features))
}

/** Push the in-progress draft preview to the map. */
export function renderDraft(
  map: AnyMap,
  kind: SketchKind | null,
  points: [number, number][],
  cursor: [number, number] | null,
  color: string,
) {
  ensureSketchLayers(map)
  if (!kind || points.length === 0) { setData(map, DRAFT, EMPTY); return }

  const pts = cursor ? [...points, cursor] : points
  const feats: GjFeature[] = points.map(p => ({
    type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: p },
  }))

  if (kind === 'circle') {
    const radius = cursor ? haversine(points[0], cursor) : 0
    if (radius > 0) {
      feats.push({ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: [circleRing(points[0], radius)] } })
      feats.push({ type: 'Feature', properties: { color, label: fmtLen(radius), isLabel: true }, geometry: { type: 'Point', coordinates: cursor! } })
    }
  } else if ((kind === 'polygon' || kind === 'measure-area') && pts.length >= 3) {
    feats.push({ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } })
    if (kind === 'measure-area') {
      feats.push({ type: 'Feature', properties: { color, label: fmtArea(polygonArea(pts)), isLabel: true }, geometry: { type: 'Point', coordinates: centroid(pts) } })
    }
  } else if (pts.length >= 2) {
    feats.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: pts } })
    if (kind === 'measure-line') {
      feats.push({ type: 'Feature', properties: { color, label: fmtLen(pathDistance(pts)), isLabel: true }, geometry: { type: 'Point', coordinates: pts[pts.length - 1] } })
    }
  }
  setData(map, DRAFT, { type: 'FeatureCollection', features: feats })
}

/** Remove all sketch layers + sources (e.g. on unmount). */
export function clearSketchData(map: AnyMap) {
  setData(map, SRC, EMPTY)
  setData(map, DRAFT, EMPTY)
}
