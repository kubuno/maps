import type maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'

// ── Fonds de carte ──────────────────────────────────────────────────────────────

export type BaseMap = 'default' | 'satellite'

// Fond vectoriel par défaut (OpenFreeMap Liberty, streaming, gratuit).
export const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

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

// ── Calques superposés (raster / relief) ────────────────────────────────────────

const CYCLE   = 'overlay-cycle'
const RELIEF  = 'overlay-relief'
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
    if (!map.getSource(DEM_SRC)) {
      map.addSource(DEM_SRC, {
        type: 'raster-dem', tileSize: 256, maxzoom: 14, encoding: 'terrarium',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        attribution: 'Relief © AWS Terrain Tiles',
      })
    }
    if (!map.getLayer(RELIEF)) {
      // Sous les libellés pour ne pas les assombrir.
      map.addLayer({ id: RELIEF, type: 'hillshade', source: DEM_SRC, paint: { 'hillshade-exaggeration': 0.45 } }, firstSymbolId(map))
    }
  } else {
    if (map.getLayer(RELIEF))   map.removeLayer(RELIEF)
    if (map.getSource(DEM_SRC)) map.removeSource(DEM_SRC)
  }
}
