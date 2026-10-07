// Route computation for the route panel: one OSRM profile with alternatives,
// the "recommended" view (car + bike + foot fetched in parallel, sorted by
// duration), the plane mode (great circle, no request) and the avoid options
// (`exclude=`), with the graceful retry when the routing server rejects them.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@kubuno/sdk'
import { parseOsrmRoute, type LatLng, type RouteResult, type RouteGeometry } from './routing'
import { greatCircleRoute } from './greatCircle'

export type RouteMode = 'recommended' | 'driving' | 'transit' | 'foot' | 'cycling' | 'plane'
export const ROUTE_MODES: RouteMode[] = ['recommended', 'driving', 'transit', 'foot', 'cycling', 'plane']

/** Profiles the routing service actually knows. */
export type OsrmMode = 'driving' | 'cycling' | 'foot'
export const OSRM_MODES: OsrmMode[] = ['driving', 'cycling', 'foot']

/** Road classes the user can ask to avoid (OSRM `exclude=` names). */
export type AvoidClass = 'toll' | 'motorway' | 'ferry'
export type AvoidSet = Record<AvoidClass, boolean>
export const NO_AVOID: AvoidSet = { toll: false, motorway: false, ferry: false }

type RawRoute = Parameters<typeof parseOsrmRoute>[0]

/** Server error shape: the SDK client flattens `{ error, message }` to the root. */
function errorCode(err: unknown): string {
  const e = err as { code?: string; response?: { data?: { error?: string } } }
  return e?.code ?? e?.response?.data?.error ?? 'UNKNOWN'
}

async function fetchOsrm(pts: LatLng[], mode: OsrmMode, alternatives: boolean, exclude: AvoidClass[]): Promise<RawRoute[]> {
  const { data } = await api.post<{ routes: RawRoute[] }>('/maps/routes', {
    waypoints:    pts.map(w => ({ lat: w.lat, lng: w.lng })),
    mode,
    alternatives,
    steps:        true,
    ...(exclude.length ? { exclude } : {}),
  })
  return data.routes ?? []
}

export interface RouteModesState {
  mode:        RouteMode
  setMode:     (m: RouteMode) => void
  results:     RouteResult[]
  /** Parallel to `results` in "recommended" mode (which profile each card is); null otherwise. */
  resultModes: OsrmMode[] | null
  selected:    number
  setSelected: (i: number) => void
  loading:     boolean
  error:       string | null
  avoid:       AvoidSet
  setAvoid:    (a: AvoidSet) => void
  /** The routing server refused the avoid options; results were recomputed without them. */
  excludeUnsupported: boolean
  /** Profile of the selected result (the mode itself outside "recommended"). */
  effectiveMode: RouteMode
  reset:       () => void
}

export function useRouteModes({ waypoints, lang, fitToRoute, onEmpty, messages }: {
  waypoints:  (LatLng | null)[]
  lang:       string
  fitToRoute: (g: RouteGeometry | null) => void
  /** Called when fewer than two points are set (clear the drawn lines). */
  onEmpty:    () => void
  messages:   { none: string; unavailable: string }
}): RouteModesState {
  const [mode,        setMode]        = useState<RouteMode>('recommended')
  const [results,     setResults]     = useState<RouteResult[]>([])
  const [resultModes, setResultModes] = useState<OsrmMode[] | null>(null)
  const [selected,    setSelected]    = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [avoid,       setAvoidState]  = useState<AvoidSet>(NO_AVOID)
  const [excludeUnsupported, setExcludeUnsupported] = useState(false)
  const seq = useRef(0)   // drops out-of-order responses

  const reset = useCallback(() => {
    seq.current++
    setResults([]); setResultModes(null); setSelected(0); setError(null); setLoading(false)
  }, [])

  const setAvoid = useCallback((a: AvoidSet) => { setAvoidState(a); setExcludeUnsupported(false) }, [])

  const calculate = useCallback(async () => {
    const pts = waypoints.filter((w): w is LatLng => w != null)
    const id = ++seq.current
    if (pts.length < 2 || mode === 'transit') { reset(); return }

    if (mode === 'plane') {
      const r = greatCircleRoute(pts)
      setResults([r]); setResultModes(null); setSelected(0); setError(null); setLoading(false)
      fitToRoute(r.geometry)
      return
    }

    setLoading(true); setError(null)
    const exclude = (Object.keys(avoid) as AvoidClass[]).filter(k => avoid[k])

    // One attempt with the avoid options, one without if the server refuses them.
    const attempt = async (ex: AvoidClass[]): Promise<{ parsed: RouteResult[]; modes: OsrmMode[] | null }> => {
      if (mode === 'recommended') {
        const settled = await Promise.allSettled(OSRM_MODES.map(m => fetchOsrm(pts, m, false, ex)))
        const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected')
        const refused = rejected.find(s => errorCode(s.reason) === 'EXCLUDE_UNSUPPORTED')
        if (refused) throw refused.reason
        const ok = settled.flatMap((s, i) => s.status === 'fulfilled' && s.value[0]
          ? [{ mode: OSRM_MODES[i], route: parseOsrmRoute(s.value[0], lang) }] : [])
        if (!ok.length && rejected.length === settled.length) throw rejected[0].reason
        ok.sort((a, b) => a.route.duration - b.route.duration)
        return { parsed: ok.map(o => o.route), modes: ok.map(o => o.mode) }
      }
      const raw = await fetchOsrm(pts, mode, true, ex)
      return { parsed: raw.map(r => parseOsrmRoute(r, lang)), modes: null }
    }

    try {
      let out: { parsed: RouteResult[]; modes: OsrmMode[] | null }
      try {
        out = await attempt(exclude)
      } catch (err) {
        if (exclude.length && errorCode(err) === 'EXCLUDE_UNSUPPORTED') {
          if (id !== seq.current) return
          setExcludeUnsupported(true)
          out = await attempt([])
        } else throw err
      }
      if (id !== seq.current) return
      if (!out.parsed.length) { setResults([]); setResultModes(null); setError(messages.none); return }
      setResults(out.parsed); setResultModes(out.modes); setSelected(0)
      fitToRoute(out.parsed[0].geometry)
    } catch {
      if (id !== seq.current) return
      setResults([]); setResultModes(null); setError(messages.unavailable)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [waypoints, mode, lang, avoid, fitToRoute, reset, messages.none, messages.unavailable])

  // Recompute whenever the set points, the mode or the options change.
  const wpKey = waypoints.map(w => (w ? `${w.lat},${w.lng}` : '∅')).join('|')
  const avoidKey = `${avoid.toll}${avoid.motorway}${avoid.ferry}`
  useEffect(() => {
    if (waypoints.filter(Boolean).length >= 2) calculate()
    else { reset(); onEmpty() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpKey, mode, avoidKey])

  const effectiveMode: RouteMode = resultModes?.[selected] ?? mode

  return {
    mode, setMode, results, resultModes, selected, setSelected, loading, error,
    avoid, setAvoid, excludeUnsupported, effectiveMode, reset,
  }
}
