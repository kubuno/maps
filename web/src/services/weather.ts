// Current weather at a coordinate — Open-Meteo (free, no API key), fetched from
// the browser. The core exposes no weather endpoint usable by modules, so the
// module talks to the provider directly (the host CSP allows https: connects).
// Results are cached per rounded coordinate (~1 km) for 10 minutes.
import { useEffect, useState } from 'react'
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  type LucideIcon,
} from 'lucide-react'

export interface WeatherNow {
  /** Air temperature at 2 m, in °C. */
  temperature: number
  /** WMO weather interpretation code (0 = clear sky … 99 = thunderstorm with hail). */
  code: number
}

const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; value: WeatherNow | null }>()
const inflight = new Map<string, Promise<WeatherNow | null>>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

function buildUrl(lat: number, lng: number): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude',  lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set('current',   'temperature_2m,weather_code')
  return url.toString()
}

/** Fetches (or serves from cache) the current weather; `null` when unavailable. */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherNow | null> {
  const key = cacheKey(lat, lng)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const pending = inflight.get(key)
  if (pending) return pending
  const p = (async () => {
    try {
      const res = await fetch(buildUrl(lat, lng))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json() as { current?: { temperature_2m?: number; weather_code?: number } }
      const cur = json.current
      const value = cur && typeof cur.temperature_2m === 'number'
        ? { temperature: cur.temperature_2m, code: cur.weather_code ?? 0 }
        : null
      cache.set(key, { at: Date.now(), value })
      return value
    } catch {
      return null           // not cached: a transient failure should retry later
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

/** Maps a WMO weather code to a lucide icon. */
export function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun
  if (code <= 2) return CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

/**
 * Current weather at `center`, refreshed when the rounded coordinate changes.
 * Nothing is fetched while `enabled` is false (the card is hidden).
 */
export function useWeather(center: { lat: number; lng: number } | null, enabled: boolean): WeatherNow | null {
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const key = center ? cacheKey(center.lat, center.lng) : null
  useEffect(() => {
    if (!enabled || !center || !key) return
    let cancelled = false
    fetchWeather(center.lat, center.lng).then(w => { if (!cancelled) setWeather(w) })
    return () => { cancelled = true }
  }, [enabled, key])   // eslint-disable-line react-hooks/exhaustive-deps
  return weather
}
