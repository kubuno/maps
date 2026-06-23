import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPinned } from 'lucide-react'
import { api } from '@kubuno/sdk'
import { DEFAULT_STYLE, geoJsonBounds } from './mapsLayers'
import { fromFeatureCollection, renderSketch } from './mapSketch'

// Vue PUBLIQUE en lecture seule d'un croquis partagé — route hors-shell
// (`maps/s/:token`), accessible à un visiteur anonyme. Charge le croquis via
// l'endpoint public sans authentification et l'affiche sur une carte plein écran.
export default function MapsPublicSketch() {
  const { token = '' } = useParams()
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [name, setName] = useState<string>('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    if (!mapDivRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: DEFAULT_STYLE,
      center: [2.3522, 48.8566],
      zoom: 4,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    const load = async () => {
      try {
        const { data } = await api.get<{ name: string; data: unknown }>(
          `/maps/sketches/public/${encodeURIComponent(token)}`,
        )
        if (cancelled) return
        setName(data.name || 'Croquis')
        const draw = () => {
          renderSketch(map, fromFeatureCollection(data.data))
          const b = geoJsonBounds(data.data)
          if (b) map.fitBounds(b, { padding: 60, duration: 0 })
        }
        if (map.isStyleLoaded()) draw()
        else map.once('load', draw)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    load()

    const ro = new ResizeObserver(() => { try { map.resize() } catch { /* removed */ } })
    ro.observe(mapDivRef.current)

    return () => {
      cancelled = true
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [token])

  return (
    <div className="relative w-full h-screen" style={{ background: '#e8eaed' }} data-module="maps">
      <div ref={mapDivRef} className="w-full h-full" />

      {/* Bandeau titre */}
      <div className="absolute top-3 left-3 z-[10] flex items-center gap-2 bg-white/95 rounded-xl shadow-lg border border-black/5 px-3 py-2">
        <MapPinned size={16} className="text-[#1a73e8]" />
        <span className="text-sm font-semibold text-slate-800">{name || 'Croquis partagé'}</span>
        <span className="text-[11px] text-slate-400">· Kubuno Maps</span>
      </div>

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Chargement…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-slate-500">
          <p className="text-lg font-medium">Croquis introuvable</p>
          <p className="text-sm text-slate-400">Ce lien est invalide ou le partage a été désactivé.</p>
        </div>
      )}
    </div>
  )
}
