// React glue for turn-by-turn navigation: tracks the live position (real GPS or
// a simulator), projects it onto the active route, drives the guidance state,
// follows the camera (heading-up), and triggers a re-route when off-route.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import maplibregl from 'maplibre-gl'
import type { RouteResult } from './routing'
import { buildNavRoute, navigate, positionAtDistance, type NavRoute, type NavState } from './navigation'

const SIM_SPEED_MS = 16        // ~58 km/h
const SIM_TICK_MS = 250
const REROUTE_AFTER = 4        // lectures off-route consécutives avant recalcul

function arrowEl(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:0;height:0'
  el.innerHTML = `<div style="width:28px;height:28px;transform:translate(-50%,-50%);
    display:flex;align-items:center;justify-content:center;
    background:#1a73e8;border-radius:50%;box-shadow:0 0 0 3px rgba(26,115,232,.3),0 2px 6px rgba(0,0,0,.4)">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2 L19 21 L12 17 L5 21 Z"/></svg>
  </div>`
  return el
}

export function useNavigation(
  mapRef: RefObject<maplibregl.Map | null>,
  route: RouteResult | null,
  opts: { onOffRoute?: (lat: number, lng: number) => void; onArrive?: () => void },
) {
  const [active, setActive] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [state, setState] = useState<NavState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const navRef     = useRef<NavRoute | null>(null)
  const markerRef  = useRef<maplibregl.Marker | null>(null)
  const watchRef   = useRef<number | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const simDistRef = useRef(0)
  const offCntRef  = useRef(0)
  const optsRef    = useRef(opts); optsRef.current = opts

  // Reconstruit la route de navigation quand l'itinéraire change (ex. recalcul).
  useEffect(() => { navRef.current = route ? buildNavRoute(route) : null }, [route])

  const handlePos = useCallback((pos: [number, number], heading: number) => {
    const map = mapRef.current
    const nav = navRef.current
    if (!map || !nav) return
    const st = navigate(nav, pos)
    setState(st)

    // Le marqueur de position (flèche) est créé dans start() ; on le repositionne.
    markerRef.current?.setLngLat(pos)

    try {
      map.easeTo({ center: pos, bearing: heading, zoom: Math.max(map.getZoom(), 16.5), pitch: 55, duration: 600 })
    } catch { /* ignore */ }

    if (st.arrived) { optsRef.current.onArrive?.(); stop(); return }

    if (st.offRoute) {
      offCntRef.current += 1
      if (offCntRef.current >= REROUTE_AFTER) {
        offCntRef.current = 0
        optsRef.current.onOffRoute?.(pos[1], pos[0])
      }
    } else {
      offCntRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef])

  const stop = useCallback(() => {
    setActive(false); setSimulating(false); setState(null)
    if (watchRef.current != null) { navigator.geolocation?.clearWatch(watchRef.current); watchRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    markerRef.current?.remove(); markerRef.current = null
    const map = mapRef.current
    try { map?.easeTo({ pitch: 0, bearing: 0, duration: 500 }) } catch { /* ignore */ }
  }, [mapRef])

  const start = useCallback((simulate: boolean) => {
    const map = mapRef.current
    if (!map || !navRef.current) { setError('no-route'); return }
    setError(null)
    setActive(true); setSimulating(simulate)
    offCntRef.current = 0
    // (Re)crée le marqueur de position.
    markerRef.current?.remove()
    markerRef.current = new maplibregl.Marker({ element: arrowEl(), rotationAlignment: 'viewport' })
      .setLngLat(navRef.current.coords[0]).addTo(map)

    if (simulate) {
      simDistRef.current = 0
      timerRef.current = setInterval(() => {
        const nav = navRef.current
        if (!nav) return
        simDistRef.current += SIM_SPEED_MS * (SIM_TICK_MS / 1000)
        const { pos, bearing } = positionAtDistance(nav, simDistRef.current)
        handlePos(pos, bearing)
      }, SIM_TICK_MS)
    } else {
      if (!navigator.geolocation) { setError('no-geo'); return }
      watchRef.current = navigator.geolocation.watchPosition(
        p => handlePos([p.coords.longitude, p.coords.latitude], p.coords.heading ?? 0),
        () => setError('geo-denied'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      )
    }
  }, [mapRef, handlePos])

  // Arrêt propre au démontage.
  useEffect(() => () => stop(), [stop])

  return { active, simulating, state, error, start, stop }
}
