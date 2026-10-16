/**
 * Code-behind of `MapsLocalCard.kbview` (converted from `MapsLocalCard.tsx`).
 *
 * "Around here" card shown under the search dropdown: the town at the map centre with the current
 * temperature, plus a traffic row when a traffic source is available. Renders nothing (root hidden) when
 * the map is too zoomed out or the town is unknown.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type maplibregl from 'maplibre-gl'

import { ViewBase } from './MapsLocalCard.kbview'
import * as __parts from './MapsLocalCard.parts.tsx'
import { buildNominatimReverseUrl } from '../services/geocoding'
import { useWeather, type WeatherNow } from '../services/weather'
import { useTrafficStatus, type TrafficStatus } from '../services/trafficStatus'

/** Soft elevation shared by the search pill, its dropdown and the local card. */
export const OVERLAY_SHADOW = '0 1px 2px rgba(60,64,67,.3), 0 2px 6px 2px rgba(60,64,67,.15)'

export interface MapCenter { lat: number; lng: number; zoom: number }

/** Minimum zoom for the local card: below that the "town at the centre" is meaningless. */
const MIN_ZOOM = 9

/** Map centre, refreshed on `moveend` with a 1.5 s debounce. `null` until the map is ready. */
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

/** Distance in metres (haversine) - used to skip reverse-geocoding tiny moves. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Name of the town at `center` (Nominatim reverse geocoding at town level). */
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

const CIRCLE_BASE = 'w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0'
const CIRCLE_COLOR: Record<TrafficStatus['level'], string> = { fluid: 'bg-success', slow: 'bg-warning', congested: 'bg-danger' }

export interface MapsLocalCardProps { center: MapCenter | null; visible: boolean }

export class MapsLocalCard extends ViewBase {
  tr!: MapsLocalCardStores['t']
  enabled = false
  town: string | null = null
  weather: WeatherNow | null = null
  traffic: TrafficStatus | null = null

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  useHooks() {
    const { center, visible } = this.props
    const enabled = visible && !!center && center.zoom >= MIN_ZOOM
    const town = useTownName(center, enabled)
    const weather = useWeather(enabled ? center : null, enabled)
    const traffic = useTrafficStatus(enabled ? center : null)
    this.publish({ enabled, town, weather, traffic })
    return { enabled, town, weather, traffic }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
    this.useHooks()
  }

  get show_root() {
    return this.enabled && !!this.town
  }

  get town_name() {
    return this.town ?? ''
  }

  get show_weather() {
    return !!this.weather
  }

  get temp() {
    return this.weather ? `${Math.round(this.weather.temperature)}°` : ''
  }

  get WeatherIcon() {
    return __parts.WeatherIcon
  }

  get weather_props() {
    return this.memo('weather_props', [this.weather], () => ({ code: this.weather?.code ?? 0 }))
  }

  get show_traffic() {
    return !!this.traffic
  }

  get traffic_circle_class() {
    return `${CIRCLE_BASE} ${this.traffic ? CIRCLE_COLOR[this.traffic.level] : ''}`
  }

  get traffic_title() {
    if (!this.traffic) return ''
    return {
      fluid:     this.tr('maps_local_traffic_fluid',     { defaultValue: 'Trafic fluide dans ce secteur' }),
      slow:      this.tr('maps_local_traffic_slow',      { defaultValue: 'Trafic ralenti dans ce secteur' }),
      congested: this.tr('maps_local_traffic_congested', { defaultValue: 'Trafic dense dans ce secteur' }),
    }[this.traffic.level]
  }

  get traffic_subtitle() {
    if (!this.traffic) return ''
    return this.traffic.delayMinutes
      ? this.tr('maps_local_traffic_delay', { defaultValue: 'Environ {{n}} min de retard', n: this.traffic.delayMinutes })
      : this.tr('maps_local_traffic_no_delay', { defaultValue: 'Pas de retards à proximité' })
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsLocalCardStores = ReturnType<MapsLocalCard['useStores']>

export default MapsLocalCard.component()
