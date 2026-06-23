import type maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { offlineRasterStyle } from './mapOffline'

// ── Fonds de carte ──────────────────────────────────────────────────────────────

export type BaseMap = 'default' | 'light' | 'terrain' | 'satellite' | 'offline'

// Fond vectoriel par défaut (OpenFreeMap Liberty, streaming, gratuit).
export const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
// Fond clair/minimal (OpenFreeMap Positron).
export const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron'

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

// Fond satellite : imagerie ESRI World Imagery (gratuite) + couche de référence
// ESRI pour les libellés (frontières, noms de lieux) activable.
export function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      'sat-img': {
        type: 'raster', tileSize: 256,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
      },
      'sat-ref': {
        type: 'raster', tileSize: 256,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      },
    },
    layers: [
      { id: 'sat-img', type: 'raster', source: 'sat-img' },
      { id: 'sat-ref', type: 'raster', source: 'sat-ref' }, // libellés (togglable)
    ],
  }
}

// Fond topographique (OpenTopoMap, raster, courbes de niveau + relief gravé).
export function topoStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      topo: {
        type: 'raster', tileSize: 256, maxzoom: 17,
        tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenTopoMap (CC-BY-SA), OpenStreetMap',
      },
    },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  }
}

// Style à appliquer pour un type de fond (URL vectorielle ou objet raster).
export function styleFor(base: BaseMap): string | StyleSpecification {
  switch (base) {
    case 'satellite': return satelliteStyle()
    case 'terrain':   return topoStyle()
    case 'light':     return LIGHT_STYLE
    case 'offline':   return offlineRasterStyle()
    default:          return DEFAULT_STYLE
  }
}

// ── Calques superposés (raster / relief) ────────────────────────────────────────

const CYCLE   = 'overlay-cycle'
const RELIEF  = 'overlay-relief'
const TRANSIT = 'overlay-transit'
const PRECIP  = 'overlay-precip'
const DEM_SRC = 'dem-terrarium'

// Insère un calque juste avant le tracé d'itinéraire (pour qu'il reste au-dessus),
// sinon en haut de la pile.
function beforeRoute(map: maplibregl.Map): string | undefined {
  return map.getLayer('route-line') ? 'route-line' : undefined
}

// id de la première couche de libellés (symbol) — pour glisser le relief dessous.
function firstSymbolId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle()?.layers ?? []
  return layers.find(l => l.type === 'symbol')?.id
}

export function applyProjection(map: maplibregl.Map, globe: boolean) {
  try { map.setProjection({ type: globe ? 'globe' : 'mercator' }) } catch { /* ignore */ }
}

// Affiche/masque les libellés : couches `symbol` (fond vectoriel) ou la couche de
// référence ESRI (fond satellite).
export function applyLabels(map: maplibregl.Map, base: BaseMap, show: boolean) {
  const vis = show ? 'visible' : 'none'
  if (base === 'satellite') {
    if (map.getLayer('sat-ref')) map.setLayoutProperty('sat-ref', 'visibility', vis)
    return
  }
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type === 'symbol') {
      try { map.setLayoutProperty(l.id, 'visibility', vis) } catch { /* ignore */ }
    }
  }
}

export function applyCycle(map: maplibregl.Map, on: boolean) {
  if (on) {
    if (!map.getSource(CYCLE)) {
      // CyclOSM (OSM-France). Hébergement communautaire — pour un usage intensif,
      // self-host une couche cyclable (cohérent avec OpenFreeMap pour le fond).
      map.addSource(CYCLE, {
        type: 'raster', tileSize: 256,
        tiles: ['https://dev.a.tile.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                'https://dev.b.tile.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                'https://dev.c.tile.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'],
        attribution: '© CyclOSM, OpenStreetMap',
      })
    }
    if (!map.getLayer(CYCLE)) map.addLayer({ id: CYCLE, type: 'raster', source: CYCLE, paint: { 'raster-opacity': 0.85 } }, beforeRoute(map))
  } else {
    if (map.getLayer(CYCLE))  map.removeLayer(CYCLE)
    if (map.getSource(CYCLE)) map.removeSource(CYCLE)
  }
}

export function applyRelief(map: maplibregl.Map, on: boolean) {
  if (on) {
    ensureDem(map)
    if (!map.getLayer(RELIEF)) {
      // Sous les libellés pour ne pas les assombrir.
      map.addLayer({ id: RELIEF, type: 'hillshade', source: DEM_SRC, paint: { 'hillshade-exaggeration': 0.45 } }, firstSymbolId(map))
    }
  } else if (map.getLayer(RELIEF)) {
    // On retire le calque mais on garde la source DEM (partagée avec le relief 3D).
    map.removeLayer(RELIEF)
  }
}

// Garantit la présence de la source d'élévation (DEM), partagée relief/3D.
function ensureDem(map: maplibregl.Map) {
  if (!map.getSource(DEM_SRC)) {
    map.addSource(DEM_SRC, {
      type: 'raster-dem', tileSize: 256, maxzoom: 14, encoding: 'terrarium',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      attribution: 'Relief © AWS Terrain Tiles',
    })
  }
}

// Relief 3D réel (extrusion du terrain). Réutilise la source DEM.
export function applyTerrain3D(map: maplibregl.Map, on: boolean) {
  try {
    if (on) {
      ensureDem(map)
      map.setTerrain({ source: DEM_SRC, exaggeration: 1.4 })
    } else {
      map.setTerrain(null)
    }
  } catch { /* ignore */ }
}

// Réseau de transports en commun (ÖPNVKarte, raster, libre).
export function applyTransit(map: maplibregl.Map, on: boolean) {
  if (on) {
    if (!map.getSource(TRANSIT)) {
      map.addSource(TRANSIT, {
        type: 'raster', tileSize: 256,
        tiles: ['https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png'],
        attribution: '© ÖPNVKarte, OpenStreetMap',
      })
    }
    if (!map.getLayer(TRANSIT)) map.addLayer({ id: TRANSIT, type: 'raster', source: TRANSIT, paint: { 'raster-opacity': 0.85 } }, beforeRoute(map))
  } else {
    if (map.getLayer(TRANSIT))  map.removeLayer(TRANSIT)
    if (map.getSource(TRANSIT)) map.removeSource(TRANSIT)
  }
}

// Radar de précipitations (RainViewer, libre, sans clé). Charge la dernière trame
// disponible (l'API publique renvoie l'hôte + le chemin de la trame courante).
export async function applyPrecip(map: maplibregl.Map, on: boolean) {
  if (!on) {
    if (map.getLayer(PRECIP))  map.removeLayer(PRECIP)
    if (map.getSource(PRECIP)) map.removeSource(PRECIP)
    return
  }
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
    const j = await res.json() as { host: string; radar?: { past?: { path: string }[] } }
    const frames = j.radar?.past ?? []
    const last = frames[frames.length - 1]
    if (!j.host || !last) return
    // {host}{path}/{size}/{z}/{x}/{y}/{couleur}/{options}.png — couleur 2, lissé+neige.
    const tiles = [`${j.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`]
    if (map.getSource(PRECIP)) { if (map.getLayer(PRECIP)) map.removeLayer(PRECIP); map.removeSource(PRECIP) }
    map.addSource(PRECIP, { type: 'raster', tileSize: 256, tiles, attribution: '© RainViewer' })
    map.addLayer({ id: PRECIP, type: 'raster', source: PRECIP, paint: { 'raster-opacity': 0.6 } }, beforeRoute(map))
  } catch { /* radar indisponible : silencieux */ }
}

// ── Calques importés (GeoJSON / KML) ────────────────────────────────────────────

const IMPORT_COLOR = '#9334e6'

/** Ajoute un FeatureCollection importé en tant que calque (fill/line/point). */
export function addImportLayer(map: maplibregl.Map, id: string, data: unknown) {
  const sid = `import-${id}`
  removeImportLayer(map, id)
  map.addSource(sid, { type: 'geojson', data: data as Parameters<maplibregl.GeoJSONSource['setData']>[0] })
  map.addLayer({ id: `${sid}-fill`, type: 'fill', source: sid, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': IMPORT_COLOR, 'fill-opacity': 0.15 } }, beforeRoute(map))
  map.addLayer({ id: `${sid}-line`, type: 'line', source: sid, filter: ['in', '$type', 'Polygon', 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': IMPORT_COLOR, 'line-width': 2.5 } }, beforeRoute(map))
  map.addLayer({ id: `${sid}-pt`, type: 'circle', source: sid, filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': IMPORT_COLOR, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } }, beforeRoute(map))
}

export function removeImportLayer(map: maplibregl.Map, id: string) {
  const sid = `import-${id}`
  for (const l of [`${sid}-fill`, `${sid}-line`, `${sid}-pt`]) if (map.getLayer(l)) map.removeLayer(l)
  if (map.getSource(sid)) map.removeSource(sid)
}

/** Emprise [[minLng,minLat],[maxLng,maxLat]] d'un GeoJSON, ou null. */
export function geoJsonBounds(data: unknown): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      minX = Math.min(minX, c[0]); minY = Math.min(minY, c[1])
      maxX = Math.max(maxX, c[0]); maxY = Math.max(maxY, c[1])
    } else if (Array.isArray(c)) { c.forEach(visit) }
  }
  const fc = data as { features?: { geometry?: { coordinates?: unknown } }[] }
  fc.features?.forEach(f => visit(f.geometry?.coordinates))
  if (!isFinite(minX)) return null
  return [[minX, minY], [maxX, maxY]]
}

/** Convertit un KML minimal (Point/LineString/Polygon) en FeatureCollection. */
export function kmlToGeoJSON(kml: string): unknown {
  const doc = new DOMParser().parseFromString(kml, 'application/xml')
  const features: unknown[] = []
  const parseCoords = (text: string): [number, number][] =>
    text.trim().split(/\s+/).map(tok => {
      const [lng, lat] = tok.split(',').map(Number)
      return [lng, lat] as [number, number]
    }).filter(p => isFinite(p[0]) && isFinite(p[1]))

  doc.querySelectorAll('Placemark').forEach(pm => {
    const name = pm.querySelector('name')?.textContent ?? undefined
    const point = pm.querySelector('Point > coordinates')?.textContent
    const line  = pm.querySelector('LineString > coordinates')?.textContent
    const poly  = pm.querySelector('Polygon coordinates')?.textContent
    const props = { name }
    if (point) {
      const c = parseCoords(point)[0]
      if (c) features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } })
    } else if (line) {
      features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: parseCoords(line) } })
    } else if (poly) {
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [parseCoords(poly)] } })
    }
  })
  return { type: 'FeatureCollection', features }
}
