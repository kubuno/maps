/**
 * React part of `MapsPublicSketch.kbview`: the full-screen MapLibre map that renders a shared sketch
 * (GeoJSON → `renderSketch`), not markers, so the `<MapView>` control does not cover it — it stays a host
 * map in a `<ReactHost>`. It reports the sketch name and the load status back to the code-behind.
 */
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '@kubuno/sdk'
import { DEFAULT_STYLE, geoJsonBounds } from '../services/mapsLayers'
import { registerThemeProtocol, installThemeImages } from '../services/mapsTheme'
import { fromFeatureCollection, renderSketch } from '../services/mapSketch'

export function SketchMap({ token, onName, onStatus }: {
  token: string
  onName: (name: string) => void
  onStatus: (status: 'loading' | 'ready' | 'error') => void
}) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!mapDivRef.current || mapRef.current) return

    registerThemeProtocol(maplibregl)
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: DEFAULT_STYLE,
      center: [2.3522, 48.8566],
      zoom: 4,
      attributionControl: { compact: true },
    })
    installThemeImages(map)
    mapRef.current = map

    const load = async () => {
      try {
        const { data } = await api.get<{ name: string; data: unknown }>(
          `/maps/sketches/public/${encodeURIComponent(token)}`,
        )
        if (cancelled) return
        onName(data.name || 'Croquis')
        const draw = () => {
          renderSketch(map, fromFeatureCollection(data.data))
          const b = geoJsonBounds(data.data)
          if (b) map.fitBounds(b, { padding: 60, duration: 0 })
        }
        if (map.isStyleLoaded()) draw()
        else map.once('load', draw)
        onStatus('ready')
      } catch {
        if (!cancelled) onStatus('error')
      }
    }
    load()

    // One resize per frame with a synchronous redraw, so a window drag never composites an empty frame.
    let resizeRaf = 0
    const ro = new ResizeObserver(() => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        try { map.resize(); map.redraw() } catch { /* removed */ }
      })
    })
    ro.observe(mapDivRef.current)

    return () => {
      cancelled = true
      ro.disconnect()
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return <div ref={mapDivRef} className="w-full h-full" />
}
