// Kubuno map theme: a restyling pass applied on top of the OpenFreeMap
// "Liberty" vector style. Liberty ships a warm, colourful palette (orange
// motorways, yellow primaries, beige land). The Kubuno theme turns it into the
// quiet, neutral look users expect from a consumer map: near-white land, soft
// green vegetation, teal-blue water, white streets on a light-grey urban mask,
// grey-blue motorways, colour-coded road shields and POI labels tinted by
// category.
//
// Mechanism: `kbstyle://default` is a MapLibre custom protocol. Resolving it
// fetches the upstream Liberty JSON, patches its layers in memory and hands
// the result to MapLibre. Callers keep using a plain style URL, so the theme
// applies to every map (main page, mini map, public sketch viewer) and to
// every `setStyle` back to the default basemap. Only the default basemap goes
// through this path — Positron, satellite, topo and offline are untouched.

import type maplibregl from 'maplibre-gl'
import type {
  StyleSpecification, LayerSpecification, ExpressionSpecification,
  FillLayerSpecification, LineLayerSpecification, SymbolLayerSpecification,
} from 'maplibre-gl'

export const THEME_STYLE_URL = 'kbstyle://default'
const UPSTREAM_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const PROTOCOL = 'kbstyle'

// ── Palette ─────────────────────────────────────────────────────────────────────

export const THEME = {
  land:        '#f5f5f5',
  urban:       '#ececec',   // residential mask (blended over land)
  commercial:  '#f4efe5',   // industrial / commercial / retail — warm beige
  park:        '#c9e7c4',
  wood:        '#d0e8ca',
  grass:       '#dcefd8',
  pitch:       '#d5ead0',
  cemetery:    '#d0e2cb',
  hospital:    '#f7e6e6',
  school:      '#f0eee3',
  sand:        '#f3eddc',
  ice:         '#eef3f5',
  water:       '#a6d5ea',
  aeroway:     '#e6e6e6',
  building:    '#e8e8e8',
  buildingLine:'#dadada',
  boundary:    '#8f8f8f',
  boundaryLow: '#b8b8b8',
  rail:        '#d2d2d2',
  road: {
    motorway:  { fill: '#a9b5c6', casing: '#8c98ab' },
    primary:   { fill: '#cbd3de', casing: '#aab4c3' },
    secondary: { fill: '#ffffff', casing: '#d3d7dd' },
    minor:     { fill: '#ffffff', casing: '#dfe1e5' },
    minorLow:  '#e0e0e0',      // minor streets at their first zoom levels (no casing yet)
    path:      '#d0d2d6',
  },
  tunnel: {
    motorway:  { fill: '#d3d9e2', casing: '#b6bec9' },
    primary:   { fill: '#e3e7ed', casing: '#c4ccd6' },
    other:     { fill: '#f5f5f5', casing: '#e0e0e0' },
  },
  text: {
    place:     '#202124',
    placeMinor:'#3c4043',
    other:     '#5f6368',
    road:      '#616161',
    path:      '#8a8a8a',
    water:     '#4d8fc4',
    halo:      '#ffffff',
  },
  poi: {
    park:     '#1e8e3e',
    shop:     '#4a7fd6',
    food:     '#e8710a',
    health:   '#d93025',
    lodging:  '#e7539a',
    transit:  '#1a73e8',
    civic:    '#6e7fa0',
    culture:  '#12a0a0',
    other:    '#5f6368',
  },
  shield: {
    motorway: { fill: '#d9463d', stroke: '#b8332b', text: '#ffffff' },   // A / N
    regional: { fill: '#f6c945', stroke: '#d9ab1f', text: '#3c4043' },   // D
    european: { fill: '#2f9e4f', stroke: '#22803c', text: '#ffffff' },   // E
    other:    { fill: '#ffffff', stroke: '#9aa0a6', text: '#3c4043' },
  },
} as const

// ── Helpers ─────────────────────────────────────────────────────────────────────

type Paint  = Record<string, unknown>
type Layout = Record<string, unknown>

function setPaint(layer: LayerSpecification, paint: Paint) {
  const l = layer as FillLayerSpecification | LineLayerSpecification | SymbolLayerSpecification
  l.paint = { ...(l.paint ?? {}), ...paint } as typeof l.paint
}
function setLayout(layer: LayerSpecification, layout: Layout) {
  const l = layer as SymbolLayerSpecification
  l.layout = { ...(l.layout ?? {}), ...layout } as typeof l.layout
}

const POI_COLOR: ExpressionSpecification = [
  'match', ['get', 'class'],
  ['park', 'golf', 'campsite', 'zoo', 'garden', 'playground', 'dog_park', 'picnic', 'swimming', 'stadium'], THEME.poi.park,
  ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'car', 'atm', 'bank', 'hardware', 'laundry', 'fuel', 'charging_station', 'hairdresser', 'florist', 'furniture', 'jewelry', 'optician', 'bakery'], THEME.poi.shop,
  ['restaurant', 'cafe', 'fast_food', 'bar', 'beer', 'ice_cream', 'food'], THEME.poi.food,
  ['hospital', 'pharmacy', 'doctors', 'doctor', 'dentist', 'veterinary', 'clinic'], THEME.poi.health,
  ['lodging'], THEME.poi.lodging,
  ['bus', 'railway', 'rail', 'airport', 'aerialway', 'harbor', 'ferry_terminal', 'ferry', 'tram_stop', 'subway'], THEME.poi.transit,
  ['school', 'college', 'library', 'town_hall', 'post', 'police', 'fire_station', 'courthouse', 'embassy'], THEME.poi.civic,
  ['attraction', 'museum', 'art_gallery', 'castle', 'monument', 'music', 'cinema', 'theatre', 'theater', 'place_of_worship', 'entertainment', 'gallery'], THEME.poi.culture,
  THEME.poi.other,
]

// First letter of a road reference ("A 13" → "A", "D 190" → "D").
const REF_LETTER: ExpressionSpecification = ['slice', ['to-string', ['get', 'ref']], 0, 1]
const SHIELD_KIND: ExpressionSpecification = [
  'match', REF_LETTER,
  ['A', 'N'], 'motorway',
  ['D'],      'regional',
  ['E'],      'european',
  'other',
]
const SHIELD_TEXT: ExpressionSpecification = [
  'match', SHIELD_KIND,
  'motorway', THEME.shield.motorway.text,
  'regional', THEME.shield.regional.text,
  'european', THEME.shield.european.text,
  THEME.shield.other.text,
]

// Road class is encoded in the layer id: `<road|bridge|tunnel>_<class>[_casing]`.
function roadClassOf(id: string): { prefix: 'road' | 'bridge' | 'tunnel'; cls: string; casing: boolean } | null {
  const m = /^(road|bridge|tunnel)_(.+?)(_casing)?$/.exec(id)
  if (!m) return null
  return { prefix: m[1] as 'road' | 'bridge' | 'tunnel', cls: m[2], casing: !!m[3] }
}

function roadColor(prefix: 'road' | 'bridge' | 'tunnel', cls: string, casing: boolean): string | null {
  const tunnel = prefix === 'tunnel'
  const pick = (k: 'motorway' | 'primary' | 'secondary' | 'minor') => {
    if (tunnel) {
      const t = k === 'motorway' ? THEME.tunnel.motorway : k === 'primary' ? THEME.tunnel.primary : THEME.tunnel.other
      return casing ? t.casing : t.fill
    }
    const r = THEME.road[k]
    return casing ? r.casing : r.fill
  }
  switch (cls) {
    case 'motorway': case 'motorway_link':            return pick('motorway')
    case 'trunk_primary': case 'link':                return pick('primary')
    case 'secondary_tertiary':                        return pick('secondary')
    case 'minor': case 'street': case 'service_track': return pick('minor')
    case 'path_pedestrian':                           return casing ? '#e8e8e8' : THEME.road.path
    case 'major_rail': case 'transit_rail':
    case 'major_rail_hatching': case 'transit_rail_hatching': return THEME.rail
    default: return null
  }
}

// ── Style transform ─────────────────────────────────────────────────────────────

export function applyTheme(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = []
  for (const layer of style.layers) {
    const id = layer.id
    switch (id) {
      case 'background':          setPaint(layer, { 'background-color': THEME.land }); break
      case 'park':                setPaint(layer, { 'fill-color': THEME.park, 'fill-opacity': 1, 'fill-outline-color': THEME.park }); break
      case 'park_outline':        setPaint(layer, { 'line-color': 'rgba(0,0,0,0)' }); break
      case 'landuse_residential':
        // Liberty stops drawing the urban mask above z12; keep it at every zoom
        // so streets stay white-on-grey inside towns.
        delete (layer as FillLayerSpecification).maxzoom
        setPaint(layer, { 'fill-color': THEME.urban, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.45, 12, 0.6, 16, 0.6] })
        break
      case 'landcover_wood':      setPaint(layer, { 'fill-color': THEME.wood, 'fill-opacity': 1 }); break
      case 'landcover_grass':     setPaint(layer, { 'fill-color': THEME.grass, 'fill-opacity': 1 }); break
      case 'landcover_ice':       setPaint(layer, { 'fill-color': THEME.ice }); break
      case 'landcover_sand':      setPaint(layer, { 'fill-color': THEME.sand }); break
      case 'landuse_pitch': case 'landuse_track': setPaint(layer, { 'fill-color': THEME.pitch }); break
      case 'landuse_cemetery':    setPaint(layer, { 'fill-color': THEME.cemetery }); break
      case 'landuse_hospital':    setPaint(layer, { 'fill-color': THEME.hospital }); break
      case 'landuse_school':      setPaint(layer, { 'fill-color': THEME.school }); break
      case 'waterway_tunnel': case 'waterway_river': case 'waterway_other':
                                  setPaint(layer, { 'line-color': THEME.water }); break
      case 'water':               setPaint(layer, { 'fill-color': THEME.water }); break
      case 'aeroway_fill':        setPaint(layer, { 'fill-color': THEME.aeroway, 'fill-opacity': 1 }); break
      case 'aeroway_runway': case 'aeroway_taxiway': setPaint(layer, { 'line-color': '#dedede' }); break
      case 'building':
        // Flat buildings at every zoom (Liberty hands over to 3D extrusions at z14).
        delete (layer as FillLayerSpecification).maxzoom
        setPaint(layer, { 'fill-color': THEME.building, 'fill-outline-color': ['interpolate', ['linear'], ['zoom'], 13, 'rgba(218,218,218,0.3)', 14, THEME.buildingLine] })
        break
      case 'building-3d':         setLayout(layer, { visibility: 'none' }); break
      case 'boundary_3':          setPaint(layer, { 'line-color': THEME.boundaryLow }); break
      case 'boundary_2': case 'boundary_disputed': setPaint(layer, { 'line-color': THEME.boundary }); break

      // Labels
      case 'waterway_line_label': case 'water_name_point_label': case 'water_name_line_label':
        setPaint(layer, { 'text-color': THEME.text.water, 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.5 }); break
      case 'poi_r20': case 'poi_r7': case 'poi_r1':
        setPaint(layer, { 'text-color': POI_COLOR, 'text-halo-color': THEME.text.halo, 'text-halo-width': 1.2 })
        setLayout(layer, { 'text-font': ['Noto Sans Regular'], 'text-size': 11 })
        break
      case 'poi_transit':
        setPaint(layer, { 'text-color': THEME.poi.transit, 'text-halo-color': THEME.text.halo })
        setLayout(layer, { 'text-font': ['Noto Sans Regular'] })
        break
      case 'highway-name-path':   setPaint(layer, { 'text-color': THEME.text.path, 'text-halo-color': THEME.land, 'text-halo-width': 1 }); break
      case 'highway-name-minor': case 'highway-name-major':
        setPaint(layer, { 'text-color': THEME.text.road, 'text-halo-color': THEME.text.halo, 'text-halo-width': 1 }); break
      case 'highway-shield-non-us':
        setLayout(layer, {
          'icon-image': ['concat', 'kb-shield-', SHIELD_KIND, '-', ['to-string', ['get', 'ref_length']]],
          'text-font': ['Noto Sans Bold'],
          'text-size': 9.5,
          'symbol-spacing': 450,
        })
        setPaint(layer, { 'text-color': SHIELD_TEXT, 'text-halo-width': 0 })
        break
      case 'airport':             setPaint(layer, { 'text-color': THEME.text.other, 'text-halo-color': THEME.text.halo }); break
      case 'label_other': case 'label_state':
        setPaint(layer, { 'text-color': THEME.text.other, 'text-halo-color': THEME.text.halo, 'text-halo-width': 1.2 }); break
      case 'label_village':
        setPaint(layer, { 'text-color': THEME.text.placeMinor, 'text-halo-color': THEME.text.halo, 'text-halo-width': 1.2 }); break
      case 'label_town': case 'label_city': case 'label_city_capital':
      case 'label_country_1': case 'label_country_2': case 'label_country_3':
        setPaint(layer, { 'text-color': THEME.text.place, 'text-halo-color': THEME.text.halo, 'text-halo-width': 1.2 }); break

      default: {
        const rc = roadClassOf(id)
        if (rc) {
          const color = roadColor(rc.prefix, rc.cls, rc.casing)
          if (color) setPaint(layer, { 'line-color': color })
          if (rc.prefix === 'road' && rc.cls === 'minor') {
            if (rc.casing) {
              // Casing only appears once the street is wide enough to read as white-on-grey.
              setPaint(layer, { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1] })
            } else {
              setPaint(layer, {
                'line-color': ['interpolate', ['linear'], ['zoom'], 13.5, THEME.road.minorLow, 15, THEME.road.minor.fill],
                'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 13, 0, 13.5, 0.6, 14, 1.4, 15, 3, 20, 18],
              })
            }
          }
          if (rc.prefix === 'road' && rc.cls === 'motorway' && !rc.casing) {
            // Liberty fades the motorway colour in from z5; the theme uses one flat colour.
            setPaint(layer, { 'line-color': THEME.road.motorway.fill })
          }
        }
      }
    }
    layers.push(layer)

    // Industrial / commercial / retail areas: warm beige, drawn right after the urban mask.
    if (id === 'landuse_residential') {
      layers.push({
        id: 'landuse_commercial',
        type: 'fill',
        source: (layer as FillLayerSpecification).source,
        'source-layer': 'landuse',
        minzoom: 10,
        filter: ['match', ['get', 'class'], ['commercial', 'industrial', 'retail', 'garages', 'railway', 'quarry', 'brownfield', 'landfill', 'military', 'bus_station'], true, false],
        paint: { 'fill-color': THEME.commercial, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1] },
      })
    }
  }
  return { ...style, layers }
}

// ── Protocol registration ───────────────────────────────────────────────────────

let registered = false

/** Registers the `kbstyle://` protocol (idempotent). Must run before a map is
 *  created with `THEME_STYLE_URL`. */
export function registerThemeProtocol(ml: typeof maplibregl): void {
  if (registered) return
  registered = true
  ml.addProtocol(PROTOCOL, async (params: { url: string }, abort?: AbortController) => {
    const res = await fetch(UPSTREAM_STYLE, { signal: abort?.signal })
    if (!res.ok) throw new Error(`Map style unavailable (${res.status}) for ${params.url}`)
    const upstream = (await res.json()) as StyleSpecification
    return { data: applyTheme(upstream) }
  })
}

// ── Road shields (generated on demand) ──────────────────────────────────────────

// Widths of the upstream `road_<n>` sprites, so the text fits the same way.
const SHIELD_WIDTHS: Record<number, number> = { 1: 14, 2: 20, 3: 25, 4: 31, 5: 36, 6: 40 }
const SHIELD_HEIGHT = 14

function drawShield(kind: keyof typeof THEME.shield, len: number): { data: ImageData; pixelRatio: number } | null {
  const w = SHIELD_WIDTHS[len] ?? 40
  const h = SHIELD_HEIGHT
  const ratio = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * ratio
  canvas.height = h * ratio
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(ratio, ratio)
  const c = THEME.shield[kind]
  const r = 3
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, r)
  ctx.fillStyle = c.fill
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = c.stroke
  ctx.stroke()
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: ratio }
}

/** Serves the `kb-shield-<kind>-<len>` images the themed style references.
 *  Call once per map; safe to call on maps that never use the theme. */
export function installThemeImages(map: maplibregl.Map): void {
  map.on('styleimagemissing', (e: { id: string }) => {
    const m = /^kb-shield-(motorway|regional|european|other)-(\d)$/.exec(e.id)
    if (!m || map.hasImage(e.id)) return
    const img = drawShield(m[1] as keyof typeof THEME.shield, Number(m[2]))
    if (img) map.addImage(e.id, img.data, { pixelRatio: img.pixelRatio })
  })
}
