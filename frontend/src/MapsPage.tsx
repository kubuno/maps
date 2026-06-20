import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Search, MapPin, Star, Navigation, Upload, Trash2,
  X, ChevronRight, Layers, RefreshCw, Route, AlertCircle,
  Activity, Plus,
  Minus, Locate,
  Utensils, BedDouble, Camera, Landmark, TramFront, Pill, Banknote,
} from 'lucide-react'
import { api } from '@kubuno/sdk'
import { Button, MenuDropdown, Input, Textarea } from '@ui'
import { HeaderActions } from '@kubuno/sdk'
import { useChromelessHeader } from '@kubuno/sdk'
import { useUiStore } from '@kubuno/sdk'
import { useMapsUiStore } from './mapsUiStore'
import { MapsAddressInput } from './MapsAddressInput'
import { MapsPlacePanel } from './MapsPlacePanel'
import { MapsLayersPanel } from './MapsLayersPanel'
import {
  DEFAULT_STYLE, satelliteStyle, applyProjection, applyLabels, applyCycle, applyRelief,
  type BaseMap,
} from './mapsLayers'
import {
  mapNominatimResult, buildNominatimSearchUrl, buildNominatimReverseUrl, placeDetails,
  type SearchResult,
} from './geocoding'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapConfig {
  default_lat:  number
  default_lng:  number
  default_zoom: number
  style_url:    string
}

interface Place {
  id:       string
  name:     string
  address:  string | null
  lat:      number
  lng:      number
  icon:     string
  category: string | null
  user_note: string | null
}

interface GpxTrace {
  id:              string
  name:            string
  distance_meters: number | null
  elevation_gain:  number | null
  activity_type:   string
  point_count:     number
  recorded_at:     string | null
  created_at:      string
}

interface Waypoint { lat: number; lng: number; label?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDist(m: number | null) {
  if (m === null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function makePlaceEl(emoji: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = `<div style="background:#1a73e8;color:#fff;border-radius:50% 50% 50% 0;
                       transform:rotate(-45deg);width:30px;height:30px;
                       display:flex;align-items:center;justify-content:center;
                       font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.35)">
             <span style="transform:rotate(45deg)">${emoji}</span>
           </div>`
  return el
}

function makeWaypointEl(label: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = `<div style="background:#1a73e8;color:#fff;border-radius:4px;
                       padding:2px 6px;font-size:11px;font-weight:600;
                       box-shadow:0 2px 4px rgba(0,0,0,.35);white-space:nowrap">${label}</div>`
  return el
}

// ── Search panel ──────────────────────────────────────────────────────────────

function SearchPanel({
  onSelect, onSave,
}: {
  onSelect: (r: SearchResult) => void
  onSave:   (r: SearchResult) => void
}) {
  const { t } = useTranslation('maps')
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(buildNominatimSearchUrl(query))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const raw: Array<Record<string, unknown>> = await res.json()
      setResults(raw.map(mapNominatimResult))
    } catch {
      setError(t('maps_geocoding_unavailable'))
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const onChange = (val: string) => {
    setQ(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={q}
          onChange={e => onChange(e.target.value)}
          placeholder={t('maps_search_placeholder')}
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-surface-0 text-sm focus:outline-none focus:border-primary"
        />
        {loading && <RefreshCw size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary animate-spin" />}
      </div>
      {error && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
      <div className="flex flex-col gap-0.5">
        {results.map(r => (
          <div
            key={r.place_id}
            className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-surface-1 cursor-pointer"
            onClick={() => { onSelect(r); setResults([]) }}
          >
            <MapPin size={14} className="text-text-tertiary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary leading-snug line-clamp-2">
                {r.display_name}
              </p>
              {r.category && (
                <p className="text-[10px] text-text-tertiary capitalize">{r.category}</p>
              )}
            </div>
            <button
              title={t('maps_save_place')}
              onClick={e => { e.stopPropagation(); onSave(r); setResults([]) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-primary/10 hover:text-primary text-text-tertiary transition-opacity"
            >
              <Plus size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Places panel ──────────────────────────────────────────────────────────────

function PlacesPanel({
  places, onFly, onDelete,
}: {
  places:   Place[]
  onFly:    (lat: number, lng: number) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation('maps')
  if (places.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-tertiary">
        <Star size={24} className="opacity-30" />
        <p className="text-xs text-center">{t('maps_places_empty')}<br/>{t('maps_places_empty_hint')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {places.map(p => (
        <div
          key={p.id}
          className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-1 cursor-pointer"
          onClick={() => onFly(p.lat, p.lng)}
        >
          <span className="text-base flex-shrink-0">{p.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{p.name}</p>
            {p.address && <p className="text-[10px] text-text-tertiary truncate">{p.address}</p>}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDelete(p.id) }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger text-text-tertiary transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── GPX panel ─────────────────────────────────────────────────────────────────

function GpxPanel({
  traces, onShow, onDelete, onUpload,
}: {
  traces:   GpxTrace[]
  onShow:   (id: string) => void
  onDelete: (id: string) => void
  onUpload: (file: File) => void
}) {
  const { t } = useTranslation('maps')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-text-tertiary hover:text-primary text-xs transition-colors"
      >
        <Upload size={13} /> {t('maps_gpx_import')}
      </button>
      <input ref={inputRef} type="file" accept=".gpx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = '' } }} />

      {traces.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2 text-text-tertiary">
          <Activity size={24} className="opacity-30" />
          <p className="text-xs text-center">{t('maps_gpx_empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {traces.map(t => (
            <div key={t.id} className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-surface-1">
              <Activity size={14} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onShow(t.id)}>
                <p className="text-xs font-medium text-text-primary truncate">{t.name}</p>
                <p className="text-[10px] text-text-tertiary">
                  {fmtDist(t.distance_meters)}
                  {t.elevation_gain ? ` · +${Math.round(t.elevation_gain)}m` : ''}
                  {' · '}{t.activity_type}
                </p>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger text-text-tertiary transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Route panel ───────────────────────────────────────────────────────────────

type RouteGeometry = { type: string; coordinates: [number, number][] }

function RoutePanel({
  waypoints, onClear, onSetStart, onSetEnd, onSetWaypoint, onClearWaypoint, onRoute,
}: {
  waypoints:    Waypoint[]
  onClear:      () => void
  onSetStart:   () => void
  onSetEnd:     () => void
  onSetWaypoint: (index: 0 | 1, lat: number, lng: number, label?: string) => void
  onClearWaypoint: (index: 0 | 1) => void
  onRoute:      (geometry: RouteGeometry | null) => void
}) {
  const { t } = useTranslation('maps')
  const [mode,   setMode]   = useState<'driving' | 'cycling' | 'foot'>('driving')
  const [result, setResult] = useState<{ distance: number; duration: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]  = useState<string | null>(null)

  const a = waypoints[0]
  const b = waypoints[1]

  const calculate = useCallback(async () => {
    if (!a || !b) return
    setLoading(true); setError(null); setResult(null)
    try {
      const { data } = await api.post<{ routes: { distance: number; duration: number; geometry: RouteGeometry }[] }>(
        '/maps/routes',
        { waypoints: [a, b].map(w => ({ lat: w.lat, lng: w.lng })), mode },
      )
      const r = data.routes?.[0]
      if (r) {
        setResult({ distance: r.distance, duration: r.duration })
        onRoute(r.geometry ?? null)          // ← trace l'itinéraire sur la carte
      } else { setError(t('maps_route_none')); onRoute(null) }
    } catch {
      setError(t('maps_route_service_unavailable')); onRoute(null)
    } finally {
      setLoading(false)
    }
  }, [a, b, mode, onRoute, t])

  // Calcule (et trace) automatiquement dès que A et B sont définis, ou au
  // changement de mode — façon Google Maps.
  useEffect(() => {
    if (a && b) calculate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.lat, a?.lng, b?.lat, b?.lng, mode])

  const modes = [
    { id: 'driving', label: t('maps_mode_driving') },
    { id: 'cycling', label: t('maps_mode_cycling') },
    { id: 'foot',    label: t('maps_mode_foot') },
  ] as const

  const wpValue = (w: Waypoint | undefined) =>
    w ? (w.label ?? `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <MapsAddressInput
          value={wpValue(a)} accent="#1e8e3e"
          placeholder={t('maps_route_from', { defaultValue: 'Point de départ' })}
          onSelect={r => onSetWaypoint(0, parseFloat(r.lat), parseFloat(r.lon), placeDetails(r).title)}
          onClear={() => onClearWaypoint(0)}
        />
        <MapsAddressInput
          value={wpValue(b)} accent="#d93025"
          placeholder={t('maps_route_to', { defaultValue: "Point d'arrivée" })}
          onSelect={r => onSetWaypoint(1, parseFloat(r.lat), parseFloat(r.lon), placeDetails(r).title)}
          onClear={() => onClearWaypoint(1)}
        />
        <div className="flex items-center gap-3 px-1 text-[11px] text-text-tertiary">
          <button onClick={onSetStart} className="hover:text-primary transition-colors">{t('maps_pick_a_on_map', { defaultValue: 'Choisir A sur la carte' })}</button>
          <span>·</span>
          <button onClick={onSetEnd} className="hover:text-primary transition-colors">{t('maps_pick_b_on_map', { defaultValue: 'Choisir B sur la carte' })}</button>
        </div>
      </div>

      <div className="flex gap-1">
        {modes.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
              mode === m.id ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
            }`}>{m.label}</button>
        ))}
      </div>

      <Button
        className="w-full"
        size="sm"
        icon={<Navigation size={13} />}
        onClick={calculate}
        disabled={!a || !b}
        loading={loading}
      >
        {loading ? t('maps_calculating') : t('maps_calculate_route')}
      </Button>

      {error && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
      {result && (
        <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-xs text-success">
          <p className="font-medium">{fmtDist(result.distance)} · {fmtDuration(result.duration)}</p>
        </div>
      )}

      {(a || b) && (
        <button onClick={onClear} className="text-xs text-text-tertiary hover:text-danger flex items-center gap-1 transition-colors">
          <X size={12} /> {t('maps_clear_route')}
        </button>
      )}
    </div>
  )
}

// ── Save place modal ───────────────────────────────────────────────────────────

function SavePlaceModal({
  lat, lng, defaultName, onSave, onClose,
}: {
  lat: number; lng: number
  defaultName: string
  onSave:  (name: string, note: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation('maps')
  const [name, setName] = useState(defaultName)
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
      <div className="bg-surface-0 rounded-xl shadow-xl border border-border p-5 w-80 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <MapPin size={16} className="text-primary" /> {t('maps_save_place')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 text-text-tertiary"><X size={15} /></button>
        </div>
        <p className="text-xs text-text-tertiary font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('maps_place_name')}
          autoFocus
        />
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('maps_note_optional')}
          rows={2}
          className="h-auto min-h-0 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('common_cancel')}</Button>
          <Button
            size="sm"
            onClick={() => { if (name.trim()) onSave(name.trim(), note.trim()) }}
            disabled={!name.trim()}
          >
            {t('common_save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Chrome façon carte plein écran ─────────────────────────────────────────────

// Bouton du rail vertical de gauche (icône + petit libellé), style application carto.
// Catégories affichées en « chips » en haut (déclencheront une recherche par type).
const CATEGORIES: { key: string; labelKey: string; fallback: string; icon: React.ReactNode }[] = [
  { key: 'restaurants', labelKey: 'maps_cat_restaurants', fallback: 'Restaurants',  icon: <Utensils size={15} className="text-orange-500" /> },
  { key: 'hotels',      labelKey: 'maps_cat_hotels',      fallback: 'Hôtels',       icon: <BedDouble size={15} className="text-pink-500" /> },
  { key: 'activities',  labelKey: 'maps_cat_activities',  fallback: 'Activités',    icon: <Camera size={15} className="text-red-500" /> },
  { key: 'museums',     labelKey: 'maps_cat_museums',     fallback: 'Musées',       icon: <Landmark size={15} className="text-amber-600" /> },
  { key: 'transit',     labelKey: 'maps_cat_transit',     fallback: 'Transports',   icon: <TramFront size={15} className="text-blue-500" /> },
  { key: 'pharmacies',  labelKey: 'maps_cat_pharmacies',  fallback: 'Pharmacies',   icon: <Pill size={15} className="text-green-600" /> },
  { key: 'atm',         labelKey: 'maps_cat_atm',         fallback: 'Distributeurs', icon: <Banknote size={15} className="text-emerald-600" /> },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { t } = useTranslation('maps')
  // Plein écran : masque l'en-tête global ; HeaderActions est réaffiché flottant
  // au-dessus de la carte (voir plus bas).
  useChromelessHeader()

  // À l'ouverture de Maps, la sidebar du core s'enroule par défaut (plus de place
  // pour la carte) ; on restaure l'état précédent en quittant le module.
  useEffect(() => {
    const prev = useUiStore.getState().sidebarCollapsed
    useUiStore.getState().setSidebarCollapsed(true)
    return () => useUiStore.getState().setSidebarCollapsed(prev)
  }, [])

  const mapDivRef  = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Record<string, maplibregl.Marker>>({})
  const lineIdsRef = useRef<Set<string>>(new Set())

  // Onglet actif partagé avec la nav de la sidebar du core (MapsSidebarBody).
  const tab    = useMapsUiStore(s => s.tab)
  const setTab = useMapsUiStore(s => s.setTab)
  const [places,    setPlaces]    = useState<Place[]>([])
  const [traces,    setTraces]    = useState<GpxTrace[]>([])
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [routePickMode, setRoutePickMode] = useState<'start' | 'end' | null>(null)
  const [ctxMenu,   setCtxMenu]   = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const [saveModal, setSaveModal] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null)

  // ── État du panneau « Couches » ──
  const [layersOpen, setLayersOpen] = useState(false)
  const [baseMap,    setBaseMap]    = useState<BaseMap>('default')
  const [showLabels, setShowLabels] = useState(true)
  const [globe,      setGlobe]      = useState(true)
  const [cycle,      setCycle]      = useState(false)
  const [relief,     setRelief]     = useState(false)
  const lastRouteRef = useRef<{ type: string; coordinates: [number, number][] } | null>(null)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: DEFAULT_STYLE,
      center: [2.3522, 48.8566],   // [lng, lat]
      zoom: 11,
    })
    // Projection globe (dezoom → planète entière) : à appliquer UNE FOIS le style
    // chargé, sinon MapLibre lève « Style is not done loading » et plante la page.
    map.on('load', () => { try { map.setProjection({ type: 'globe' }) } catch { /* ignore */ } })

    // Try to load config for default view
    api.get<MapConfig>('/maps/config').then(({ data }) => {
      if (data.default_lat && data.default_lng) {
        map.jumpTo({ center: [data.default_lng, data.default_lat], zoom: data.default_zoom ?? 12 })
      }
    }).catch(() => {/* use defaults */})

    // Right-click context menu
    map.on('contextmenu', (e) => {
      setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // Click on map — route point picking
    map.on('click', (e) => {
      setRoutePickMode(mode => {
        if (mode === 'start') {
          setWaypoints(wp => { const n = [...wp]; n[0] = { lat: e.lngLat.lat, lng: e.lngLat.lng }; return n })
          return 'end'
        }
        if (mode === 'end') {
          setWaypoints(wp => { const n = [...wp]; n[1] = { lat: e.lngLat.lat, lng: e.lngLat.lng }; return n })
          return null
        }
        return mode
      })
      setCtxMenu(null)
    })

    mapRef.current = map

    // La carte est créée avant que son conteneur ait sa taille DÉFINITIVE :
    // l'en-tête chromeless se masque et la sidebar se met en place APRÈS le
    // montage. MapLibre mesure alors un conteneur trop petit et le canvas y reste
    // figé jusqu'au prochain resize (d'où « ça remplit seulement après avoir
    // (dé)roulé la sidebar »). On force donc un resize après la 1ʳᵉ mise en page
    // ET on observe le conteneur pour tout changement ultérieur.
    const doResize = () => { try { map.resize() } catch { /* carte retirée */ } }
    const ro = new ResizeObserver(doResize)
    ro.observe(mapDivRef.current)
    const raf = requestAnimationFrame(doResize)
    const t1  = setTimeout(doResize, 250)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load saved places ────────────────────────────────────────────────────────
  const loadPlaces = useCallback(async () => {
    try {
      const { data } = await api.get<{ places: Place[] }>('/maps/places')
      setPlaces(data.places ?? [])
    } catch {/* ignore */}
  }, [])

  const loadTraces = useCallback(async () => {
    try {
      const { data } = await api.get<{ traces: GpxTrace[] }>('/maps/gpx')
      setTraces(data.traces ?? [])
    } catch {/* ignore */}
  }, [])

  useEffect(() => { loadPlaces(); loadTraces() }, [loadPlaces, loadTraces])

  // ── Sync place markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old markers
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key.startsWith('place-')) { marker.remove(); delete markersRef.current[key] }
    })

    // Add markers
    places.forEach(p => {
      const m = new maplibregl.Marker({ element: makePlaceEl(p.icon), anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 30 }).setHTML(`<div style="min-width:160px">
          <p style="font-weight:600;margin:0 0 4px">${p.name}</p>
          ${p.address ? `<p style="font-size:12px;color:#5f6368;margin:0 0 4px">${p.address}</p>` : ''}
          ${p.user_note ? `<p style="font-size:12px;font-style:italic;margin:0">${p.user_note}</p>` : ''}
        </div>`))
        .addTo(map)
      markersRef.current[`place-${p.id}`] = m
    })
  }, [places])

  // ── Route waypoint markers ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    ;['wp-0', 'wp-1'].forEach(k => {
      if (markersRef.current[k]) { markersRef.current[k].remove(); delete markersRef.current[k] }
    })
    waypoints.forEach((wp, i) => {
      const m = new maplibregl.Marker({ element: makeWaypointEl(i === 0 ? 'A' : 'B') })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map)
      markersRef.current[`wp-${i}`] = m
    })
  }, [waypoints])

  // ── Fly to ────────────────────────────────────────────────────────────────────
  const flyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800 })
  }, [])

  // ── Sélection d'un lieu (ouvre le panneau d'infos + marqueur + recentrage) ─────
  const selectPlace = useCallback((r: SearchResult) => {
    setSelectedPlace(r)
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
    flyTo(lat, lng, 16)
    const map = mapRef.current
    if (map) {
      markersRef.current['selected']?.remove()
      const m = new maplibregl.Marker({ element: makePlaceEl('📍') }).setLngLat([lng, lat]).addTo(map)
      markersRef.current['selected'] = m
    }
  }, [flyTo])

  const clearSelectedPlace = useCallback(() => {
    setSelectedPlace(null)
    markersRef.current['selected']?.remove()
    delete markersRef.current['selected']
  }, [])

  // « Itinéraire » depuis le panneau d'un lieu → en fait la destination (B) et
  // bascule sur l'onglet itinéraire.
  const routeToPlace = useCallback((lat: number, lng: number, label: string) => {
    setWaypoints(wp => { const n = [...wp]; n[1] = { lat, lng, label }; return n })
    setRoutePickMode(null)
    clearSelectedPlace()
    setTab('route')
  }, [clearSelectedPlace, setTab])

  // Changer d'onglet (via la nav de la sidebar) ferme le panneau d'infos du lieu.
  useEffect(() => { clearSelectedPlace() }, [tab, clearSelectedPlace])

  // ── Save place from search ────────────────────────────────────────────────────
  const saveFromSearch = useCallback((r: SearchResult) => {
    setSaveModal({
      lat:  parseFloat(r.lat),
      lng:  parseFloat(r.lon),
      name: r.display_name.split(',')[0].trim(),
    })
    flyTo(parseFloat(r.lat), parseFloat(r.lon))
  }, [flyTo])

  // ── Save place from right-click ───────────────────────────────────────────────
  const saveFromContextMenu = useCallback(async (lat: number, lng: number) => {
    let defaultName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    try {
      const res = await fetch(buildNominatimReverseUrl(lat, lng))
      if (res.ok) {
        const data: { display_name?: string } = await res.json()
        if (data.display_name) defaultName = data.display_name.split(',')[0].trim()
      }
    } catch {/* keep coordinates as name */}
    setSaveModal({ lat, lng, name: defaultName })
  }, [])

  const confirmSave = useCallback(async (name: string, note: string) => {
    if (!saveModal) return
    try {
      await api.post('/maps/places', {
        name,
        lat:       saveModal.lat,
        lng:       saveModal.lng,
        user_note: note || null,
        icon:      '📍',
      })
      setSaveModal(null)
      await loadPlaces()
      setTab('places')
    } catch {/* ignore */}
  }, [saveModal, loadPlaces])

  const deletePlace = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/places/${id}`)
      setPlaces(ps => ps.filter(p => p.id !== id))
      const key = `place-${id}`
      markersRef.current[key]?.remove()
      delete markersRef.current[key]
    } catch {/* ignore */}
  }, [])

  // ── GPX upload ────────────────────────────────────────────────────────────────
  const uploadGpx = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      await api.post('/maps/gpx', buf, {
        headers: { 'Content-Type': 'application/gpx+xml' },
        params:  { name: file.name.replace('.gpx', '') },
      })
      await loadTraces()
      setTab('gpx')
    } catch {/* ignore */} finally {
      setUploading(false)
    }
  }, [loadTraces])

  const showGpx = useCallback(async (id: string) => {
    const map = mapRef.current
    if (!map) return
    try {
      const { data } = await api.get<ArrayBuffer>(`/maps/gpx/${id}/download`, {
        responseType: 'arraybuffer',
      })
      const text    = new TextDecoder().decode(data)
      const parser  = new DOMParser()
      const doc     = parser.parseFromString(text, 'application/xml')
      const trkpts  = Array.from(doc.querySelectorAll('trkpt'))
      if (!trkpts.length) return
      const coords = trkpts.map(pt => [
        parseFloat(pt.getAttribute('lon') ?? '0'),
        parseFloat(pt.getAttribute('lat') ?? '0'),
      ] as [number, number])

      const id2 = `gpx-${id}`
      if (map.getLayer(id2)) map.removeLayer(id2)
      if (map.getSource(id2)) map.removeSource(id2)

      const addLine = () => {
        map.addSource(id2, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        })
        map.addLayer({
          id: id2,
          type: 'line',
          source: id2,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:  { 'line-color': '#1a73e8', 'line-width': 3, 'line-opacity': 0.85 },
        })
        const b = new maplibregl.LngLatBounds(coords[0], coords[0])
        coords.forEach(c => b.extend(c))
        map.fitBounds(b, { padding: 40, duration: 800 })
      }
      if (map.isStyleLoaded()) addLine()
      else map.once('load', addLine)

      lineIdsRef.current.add(id2)
    } catch {/* ignore */}
  }, [])

  const deleteGpx = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/gpx/${id}`)
      setTraces(ts => ts.filter(t => t.id !== id))
      const map = mapRef.current
      const id2 = `gpx-${id}`
      if (map) {
        if (map.getLayer(id2)) map.removeLayer(id2)
        if (map.getSource(id2)) map.removeSource(id2)
      }
      lineIdsRef.current.delete(id2)
    } catch {/* ignore */}
  }, [])

  // ── Route ─────────────────────────────────────────────────────────────────────
  // Définit le point A (0) ou B (1) de l'itinéraire, avec un libellé optionnel
  // (issu de la recherche d'adresse).
  const setWaypointAt = useCallback((index: 0 | 1, lat: number, lng: number, label?: string) => {
    setWaypoints(wp => { const n = [...wp]; n[index] = { lat, lng, label }; return n })
    setRoutePickMode(null)
  }, [])

  const clearWaypointAt = useCallback((index: 0 | 1) => {
    setWaypoints(wp => { const n = [...wp]; delete n[index]; return n })
  }, [])

  // Dessine le tracé de l'itinéraire (géométrie GeoJSON renvoyée par OSRM) sur la
  // carte, et cadre la vue dessus.
  const showRoute = useCallback((geometry: { type: string; coordinates: [number, number][] } | null) => {
    const map = mapRef.current
    lastRouteRef.current = geometry   // mémorisé pour re-tracer après un changement de fond
    if (!map || !geometry || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return
    const id2 = 'route-line'
    const draw = () => {
      if (map.getLayer(id2)) map.removeLayer(id2)
      if (map.getSource(id2)) map.removeSource(id2)
      map.addSource(id2, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry } })
      map.addLayer({
        id: id2, type: 'line', source: id2,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint:  { 'line-color': '#1a73e8', 'line-width': 5, 'line-opacity': 0.85 },
      })
      const coords = geometry.coordinates
      const b = new maplibregl.LngLatBounds(coords[0], coords[0])
      coords.forEach(c => b.extend(c))
      map.fitBounds(b, { padding: 60, duration: 800 })
      lineIdsRef.current.add(id2)
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [])

  const clearRoute = useCallback(() => {
    setWaypoints([])
    lastRouteRef.current = null
    const map = mapRef.current
    if (map) {
      // Retire le tracé d'itinéraire dessiné (route-*).
      Array.from(lineIdsRef.current).forEach(id => {
        if (id.startsWith('route-')) {
          if (map.getLayer(id)) map.removeLayer(id)
          if (map.getSource(id)) map.removeSource(id)
          lineIdsRef.current.delete(id)
        }
      })
    }
  }, [])

  // ── Couches : type de fond + calques + bascules ──
  // Changer de fond recharge le style ; on réapplique projection, libellés,
  // calques actifs et le tracé d'itinéraire une fois le nouveau style chargé.
  const switchBase = (b: BaseMap) => {
    setBaseMap(b)
    const map = mapRef.current
    if (!map) return
    map.setStyle(b === 'satellite' ? satelliteStyle() : DEFAULT_STYLE)
    map.once('styledata', () => {
      applyProjection(map, globe)
      applyLabels(map, b, showLabels)
      if (cycle)  applyCycle(map, true)
      if (relief) applyRelief(map, true)
      if (lastRouteRef.current) showRoute(lastRouteRef.current)
    })
  }
  const toggleGlobe = () => {
    const next = !globe; setGlobe(next)
    if (mapRef.current) applyProjection(mapRef.current, next)
  }
  const toggleLabels = () => {
    const next = !showLabels; setShowLabels(next)
    if (mapRef.current) applyLabels(mapRef.current, baseMap, next)
  }
  const toggleCycle = () => {
    const next = !cycle; setCycle(next)
    if (mapRef.current) applyCycle(mapRef.current, next)
  }
  const toggleRelief = () => {
    const next = !relief; setRelief(next)
    if (mapRef.current) applyRelief(mapRef.current, next)
  }

  // ── Cursor during route pick ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routePickMode) {
      map.getCanvas().style.cursor = 'crosshair'
    } else {
      map.getCanvas().style.cursor = ''
    }
  }, [routePickMode])

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  // Recentre sur la position de l'utilisateur (bouton « ma position »).
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => flyTo(pos.coords.latitude, pos.coords.longitude, 15),
      () => { /* permission refusée / indisponible : silencieux */ },
    )
  }

  return (
    <div className="relative h-full overflow-hidden" style={{ background: '#e8eaed' }}>
      {/* Carte plein écran (moteur MapLibre GL — tuiles vectorielles OpenFreeMap, projection globe).
          NB : on utilise w-full/h-full et NON `absolute inset-0` car maplibre-gl.css force
          `.maplibregl-map { position: relative }`, ce qui écraserait le positionnement absolu
          et ferait retomber le canvas à sa hauteur par défaut (300px → carte invisible). */}
      <div ref={mapDivRef} className="w-full h-full" />

      {/* ── Panneau flottant (recherche / lieux / gpx / itinéraire) ──
          La nav (Lieux/Recherche/GPX/Itinéraire) vit désormais dans la sidebar du
          core (MapsSidebarBody) ; ce panneau ne montre plus que le CONTENU de
          l'onglet actif. Plus de rail → il flotte au bord gauche de la carte. */}
      <div className="absolute left-3 top-3 w-[370px] max-w-[calc(100vw-24px)] max-h-[calc(100%-24px)] z-[1100] flex flex-col min-h-0 no-print">
        {selectedPlace ? (
          <MapsPlacePanel place={selectedPlace} onClose={clearSelectedPlace} onRouteTo={routeToPlace} onSave={saveFromSearch} />
        ) : (
          <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col min-h-0">
            <div className="overflow-y-auto p-3">
              {tab === 'search' && <SearchPanel onSelect={selectPlace} onSave={saveFromSearch} />}
              {tab === 'places' && <PlacesPanel places={places} onFly={(lat, lng) => flyTo(lat, lng)} onDelete={deletePlace} />}
              {tab === 'gpx'    && <GpxPanel traces={traces} onShow={showGpx} onDelete={deleteGpx} onUpload={uploadGpx} />}
              {tab === 'route'  && <RoutePanel waypoints={waypoints} onClear={clearRoute} onSetStart={() => setRoutePickMode('start')} onSetEnd={() => setRoutePickMode('end')} onSetWaypoint={setWaypointAt} onClearWaypoint={clearWaypointAt} onRoute={showRoute} />}
            </div>
          </div>
        )}
      </div>

      {/* ── HeaderActions flottant (plein écran) : rectangle arrondi sur la carte ── */}
      <div className="absolute top-3 right-3 z-[1110] bg-surface-0 rounded-2xl shadow-md border border-border px-1 flex items-center no-print">
        <HeaderActions compact />
      </div>

      {/* ── Chips de catégories (haut) — masquées sur mobile (place réduite) ── */}
      <div className="absolute top-4 left-[400px] right-[252px] z-[1090] hidden sm:flex gap-2 overflow-x-auto no-print" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setTab('search')}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-0 border border-border shadow-sm text-[13px] font-medium text-text-primary hover:bg-surface-1 whitespace-nowrap flex-shrink-0 transition-colors">
            {c.icon}{t(c.labelKey, { defaultValue: c.fallback })}
          </button>
        ))}
      </div>

      {/* Bandeau de sélection d'itinéraire */}
      {routePickMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-primary rounded-lg px-4 py-2 shadow-lg flex items-center gap-3 text-sm">
          <ChevronRight size={16} className="text-primary" />
          <span>{routePickMode === 'start' ? t('maps_pick_start') : t('maps_pick_end')}</span>
          <button onClick={() => setRoutePickMode(null)} className="text-text-tertiary hover:text-text-primary"><X size={15} /></button>
        </div>
      )}

      {/* ── Contrôles bas-droite : localisation + zoom ── */}
      <div className="absolute bottom-6 right-4 z-[1100] flex flex-col items-end gap-3 no-print">
        <button onClick={locate} title={t('maps_locate', { defaultValue: 'Ma position' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <Locate size={18} />
        </button>
        <div className="flex flex-col bg-surface-0 rounded-lg border border-border shadow-md overflow-hidden">
          <button onClick={() => mapRef.current?.zoomIn()} title={t('maps_zoom_in', { defaultValue: 'Zoom avant' })}
            className="w-10 h-10 flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors"><Plus size={18} /></button>
          <div className="h-px bg-border mx-1.5" />
          <button onClick={() => mapRef.current?.zoomOut()} title={t('maps_zoom_out', { defaultValue: 'Zoom arrière' })}
            className="w-10 h-10 flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors"><Minus size={18} /></button>
        </div>
      </div>

      {/* ── Calques (bas-gauche) ── */}
      <div className="absolute bottom-6 left-3 z-[1100] no-print">
        {layersOpen && (
          <div className="absolute bottom-12 left-0">
            <MapsLayersPanel
              baseMap={baseMap}      onBaseMap={switchBase}
              showLabels={showLabels} onToggleLabels={toggleLabels}
              globe={globe}           onToggleGlobe={toggleGlobe}
              cycle={cycle}           onToggleCycle={toggleCycle}
              relief={relief}         onToggleRelief={toggleRelief}
              onClose={() => setLayersOpen(false)}
            />
          </div>
        )}
        <button title={t('maps_layers')} onClick={() => setLayersOpen(o => !o)}
          className={`flex items-center gap-2 h-10 px-3 rounded-lg border shadow-md text-[13px] font-medium transition-colors
            ${layersOpen ? 'bg-primary-light border-primary text-primary' : 'bg-surface-0 border-border text-text-secondary hover:bg-surface-1'}`}>
          <Layers size={16} /> {t('maps_layers')}
        </button>
      </div>

      {/* Téléversement GPX en cours */}
      {uploading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-border rounded-full px-3 py-1.5 shadow-md flex items-center gap-2 text-xs text-text-secondary">
          <RefreshCw size={12} className="animate-spin" /> {t('maps_uploading')}
        </div>
      )}

      {/* Menu contextuel */}
      {ctxMenu && (
        <MenuDropdown
          pos={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClose={() => setCtxMenu(null)}
          items={[
            { type: 'label', text: `${ctxMenu.lat.toFixed(5)}, ${ctxMenu.lng.toFixed(5)}` },
            { type: 'action', icon: <Star size={13} />, label: t('maps_save_place'), onClick: () => saveFromContextMenu(ctxMenu.lat, ctxMenu.lng) },
            {
              type: 'action',
              icon: <Route size={13} />,
              label: t('maps_route_to_here'),
              onClick: () => {
                setWaypoints(wp => { const n = [...wp]; n[1] = { lat: ctxMenu.lat, lng: ctxMenu.lng }; return n })
                setTab('route')
              },
            },
          ]}
        />
      )}

      {/* Modale d'enregistrement */}
      {saveModal && (
        <SavePlaceModal
          lat={saveModal.lat}
          lng={saveModal.lng}
          defaultName={saveModal.name}
          onSave={confirmSave}
          onClose={() => setSaveModal(null)}
        />
      )}
    </div>
  )
}
