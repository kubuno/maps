import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, ChevronRight } from 'lucide-react'
import type maplibregl from 'maplibre-gl'
import { buildNominatimReverseUrl } from './geocoding'
import { useWeather, weatherIcon } from './weather'
import { useTrafficStatus, type TrafficStatus } from './trafficStatus'

/** Soft elevation shared by the search pill, its dropdown and the local card. */
export const OVERLAY_SHADOW = '0 1px 2px rgba(60,64,67,.3), 0 2px 6px 2px rgba(60,64,67,.15)'

export interface MapCenter { lat: number; lng: number; zoom: number }

/** Minimum zoom for the local card: below that the "town at the centre" is meaningless. */
const MIN_ZOOM = 9

/**
 * Map centre, refreshed on `moveend` with a 1.5 s debounce (the map fires a
 * burst of moves while the user pans/zooms). `null` until the map is ready.
 */
export function useMapCenter(mapRef: RefObject<maplibregl.Map | null>, mapReady: boolean): MapCenter | null {
  const [center, setCenter] = useState<MapCenter | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const read = () => {
      const c = map.getCenter()
      setCenter({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
    }
    const onMove = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(read, 1500)
    }
    read()
    map.on('moveend', onMove)
    return () => { map.off('moveend', onMove); if (timer) clearTimeout(timer) }
  }, [mapRef, mapReady])
  return center
}

/** Distance in metres (haversine) — used to skip reverse-geocoding tiny moves. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Name of the town at `center` (Nominatim reverse geocoding at town level).
 * Only fetched while `enabled`, and skipped when the centre moved < 500 m
 * since the last lookup (keeps the public geocoder's rate limit happy).
 */
function useTownName(center: MapCenter | null, enabled: boolean): string | null {
  const [town, setTown] = useState<string | null>(null)
  const last = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (!enabled || !center || center.zoom < MIN_ZOOM) return
    if (last.current && distanceM(last.current, center) < 500) return
    const at = { lat: center.lat, lng: center.lng }
    last.current = at
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(buildNominatimReverseUrl(at.lat, at.lng, 10))
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const raw = await res.json() as { address?: Record<string, string> }
        const a = raw.address ?? {}
        const name = a.city || a.town || a.village || a.municipality || null
        if (!cancelled) setTown(name)
      } catch {
        if (!cancelled) { setTown(null); last.current = null }   // retry on next move
      }
    })()
    return () => { cancelled = true }
  }, [enabled, center])
  return town
}

function TrafficRow({ status }: { status: TrafficStatus }) {
  const { t } = useTranslation('maps')
  const title = {
    fluid:     t('maps_local_traffic_fluid',     { defaultValue: 'Trafic fluide dans ce secteur' }),
    slow:      t('maps_local_traffic_slow',      { defaultValue: 'Trafic ralenti dans ce secteur' }),
    congested: t('maps_local_traffic_congested', { defaultValue: 'Trafic dense dans ce secteur' }),
  }[status.level]
  const subtitle = status.delayMinutes
    ? t('maps_local_traffic_delay', { defaultValue: 'Environ {{n}} min de retard', n: status.delayMinutes })
    : t('maps_local_traffic_no_delay', { defaultValue: 'Pas de retards à proximité' })
  const circle = { fluid: 'bg-success', slow: 'bg-warning', congested: 'bg-danger' }[status.level]
  return (
    <div className="flex items-center gap-3 px-4 h-16 border-t border-border">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 ${circle}`}>
        <Car size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        <p className="text-sm text-text-secondary truncate">{subtitle}</p>
      </div>
      <ChevronRight size={20} className="text-text-secondary flex-shrink-0" />
    </div>
  )
}

/**
 * "Around here" card shown under the search dropdown: the town at the map
 * centre with the current temperature, plus a traffic row when a traffic
 * source is available (see `trafficStatus.ts`). Renders nothing when the map is
 * too zoomed out or the town is unknown.
 */
export function MapsLocalCard({ center, visible }: { center: MapCenter | null; visible: boolean }) {
  const enabled = visible && !!center && center.zoom >= MIN_ZOOM
  const town    = useTownName(center, enabled)
  const weather = useWeather(enabled ? center : null, enabled)
  const traffic = useTrafficStatus(enabled ? center : null)
  if (!enabled || !town) return null
  const Icon = weather ? weatherIcon(weather.code) : null
  return (
    <div className="rounded-3xl bg-surface-0 overflow-hidden" style={{ boxShadow: OVERLAY_SHADOW }}>
      <div className="flex items-center gap-3 px-5 h-14">
        <p className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{town}</p>
        {weather && Icon && (
          <span className="flex items-center gap-2 text-sm text-text-primary flex-shrink-0">
            <span>{Math.round(weather.temperature)}°</span>
            <Icon size={22} className="text-text-secondary" />
          </span>
        )}
      </div>
      {traffic && <TrafficRow status={traffic} />}
    </div>
  )
}
