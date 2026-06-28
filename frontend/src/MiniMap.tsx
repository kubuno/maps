// A small, self-contained MapLibre map that plots points. Maps exposes it via
// ModuleServiceRegistry so OTHER modules (e.g. p2pnas) can show a real world map
// WITHOUT importing maps' code — maps renders it. Like the rest of maps, points
// are drawn ON the WebGL canvas (a GeoJSON source + GL circle layer), not as DOM
// markers. Uses the public OpenFreeMap style (no auth).
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DEFAULT_STYLE } from './mapsLayers'

export interface MapMarker {
  lat: number
  lng: number
  label?: string
  color?: string
}

const SRC = 'minimap-points'

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

export default function MiniMap({ markers, height = 300 }: { markers: MapMarker[]; height?: number }) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [webglError, setWebglError] = useState(false)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: divRef.current,
        style: DEFAULT_STYLE,
        center: [5, 30],
        zoom: 1.1,
        attributionControl: false,
      })
    } catch {
      // No WebGL (some headless / locked-down browsers) → degrade gracefully.
      setWebglError(true)
      return
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      try { map.setProjection({ type: 'globe' }) } catch { /* globe optional */ }
      // Source + GL layer: points are rasterised by MapLibre onto the canvas.
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
      // Click a point → popup with its label (canvas hit-test via queryRenderedFeatures).
      map.on('click', `${SRC}-circles`, e => {
        const f = e.features?.[0]
        const label = (f?.properties as { label?: string } | undefined)?.label
        if (label) {
          new maplibregl.Popup({ closeButton: false })
            .setLngLat(e.lngLat)
            .setText(label)
            .addTo(map)
        }
      })
      map.on('mouseenter', `${SRC}-circles`, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', `${SRC}-circles`, () => { map.getCanvas().style.cursor = '' })
      sync()
    })

    return () => { map.remove(); mapRef.current = null }
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
      <div
        style={{ height, width: '100%', borderRadius: 8 }}
        className="flex items-center justify-center text-sm text-text-tertiary bg-surface-1 border border-border"
      >
        Carte indisponible : ce navigateur ne supporte pas WebGL.
      </div>
    )
  }
  return <div ref={divRef} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }} />
}
