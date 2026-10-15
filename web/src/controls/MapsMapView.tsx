// MapsMapView — the native MapLibre map behind the `.kbview` <MapView> host control
// (registered in src/kbview-controls.json, dom_root:"ref"). The map itself is WebGL and
// cannot be expressed in view primitives, so, like PaintBox, it stays a React control; the
// overlays around it (search bar, panels, cards) are the parts that become .kbview.
//
// This wraps the EXISTING map building blocks (styleFor from mapsLayers, the theme protocol
// and images from mapsTheme) rather than introducing a new engine — the same approach as
// MiniMap. Mirrors the mobile `MapView` control in name and intent.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { styleFor, type BaseMap } from '../services/mapsLayers'
import { registerThemeProtocol, installThemeImages } from '../services/mapsTheme'
import type { MapMarker } from '../maps-app/MiniMap'

/** The .kbview `BaseMap` enum values (capitalised) mapped to the internal `BaseMap` union. */
const BASE_MAP: Record<string, BaseMap> = {
  Default: 'default', Light: 'light', Terrain: 'terrain', Satellite: 'satellite', Offline: 'offline',
}

const SRC = 'mapview-points'

export interface MapsMapViewProps {
  /** The .kbview `BaseMap` value (capitalised enum member); defaults to the vector map. */
  base?:        string
  showLabels?:  boolean
  interactive?: boolean
  lon?:         number
  lat?:         number
  zoom?:        number
  /** Points to plot (bound through the `Markers` property). */
  markers?:     MapMarker[]
  /** Raised after the map finished panning or zooming (the `OnMoveEnd` event). */
  onMoveEnd?:   () => void
  className?:   string
  style?:       React.CSSProperties
}

function toFeatureCollection(markers: MapMarker[]) {
  return {
    type: 'FeatureCollection' as const,
    features: markers
      .filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng))
      .map(m => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: { label: m.label ?? '', color: m.color ?? '#1a73e8' },
      })),
  }
}

/**
 * The container ref is forwarded to the view renderer (dom_root:"ref"): the renderer applies
 * layout/size/visibility to this element, and MapLibre mounts its canvas inside it.
 */
export const MapsMapView = forwardRef<HTMLDivElement, MapsMapViewProps>(function MapsMapView(
  { base, showLabels, interactive = true, lon = 0, lat = 20, zoom = 1.1, markers = [], onMoveEnd, className, style },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [webglError, setWebglError] = useState(false)
  useImperativeHandle(ref, () => divRef.current as HTMLDivElement, [])

  // `showLabels` is reserved for a future label-layer toggle; referenced so the prop is not flagged unused.
  void showLabels

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      registerThemeProtocol(maplibregl)
      map = new maplibregl.Map({
        container: divRef.current,
        style: styleFor((base && BASE_MAP[base]) || 'default'),
        center: [lon, lat],
        zoom,
        interactive,
        attributionControl: false,
      })
    } catch {
      // No WebGL (some headless / locked-down browsers) → degrade gracefully.
      setWebglError(true)
      return
    }
    installThemeImages(map)
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const emitMove = () => onMoveEnd?.()
    map.on('moveend', emitMove)
    map.on('load', () => {
      try { map.setProjection({ type: 'globe' }) } catch { /* globe optional */ }
      map.addSource(SRC, { type: 'geojson', data: toFeatureCollection([]) })
      map.addLayer({
        id: `${SRC}-circles`,
        type: 'circle',
        source: SRC,
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      sync()
    })

    return () => { map.off('moveend', emitMove); map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers])

  function sync() {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const fc = toFeatureCollection(markers)
    src.setData(fc)
    // Frame the markers the way MiniMap did: fit to their bounds, or jump to the single point.
    if (!fc.features.length) return
    const coords = fc.features.map(f => f.geometry.coordinates as [number, number])
    if (coords.length > 1) {
      const b = new maplibregl.LngLatBounds(coords[0], coords[0])
      coords.forEach(c => b.extend(c))
      map.fitBounds(b, { padding: 44, maxZoom: 6, duration: 600 })
    } else {
      map.jumpTo({ center: coords[0], zoom: 4 })
    }
  }

  if (webglError) {
    return (
      <div ref={divRef} className={className} style={style}>
        <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary bg-surface-1 border border-border rounded-lg">
          Carte indisponible : ce navigateur ne supporte pas WebGL.
        </div>
      </div>
    )
  }
  return <div ref={divRef} className={className} style={{ overflow: 'hidden', ...style }} />
})
