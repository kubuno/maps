import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Search, MapPin, Star, Navigation, Upload, Trash2,
  X, ChevronRight, Layers, RefreshCw, Route, AlertCircle,
  Activity, Plus,
  Minus, Locate,
  ArrowUp, ArrowUpRight, ArrowRight, ArrowUpLeft, ArrowLeft,
  CornerUpRight, CornerUpLeft, RotateCcw, RotateCw, Flag,
  ChevronUp, ChevronDown, List,
  Ruler, Shapes, Copy, Info, Type as TypeIcon, Compass, Play,
  HelpCircle, WifiOff, Keyboard, Circle, Check, Orbit,
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
  DEFAULT_STYLE, styleFor, applyProjection, applyLabels, applyCycle, applyRelief,
  applyTransit, applyPrecip, applyTerrain3D, addImportLayer, removeImportLayer,
  geoJsonBounds, kmlToGeoJSON,
  type BaseMap,
} from './mapsLayers'
import {
  mapNominatimResult, buildNominatimSearchUrl, buildNominatimReverseUrl, placeDetails,
  type SearchResult,
} from './geocoding'
import { POI_CHIPS, fetchNearbyPois, poiToSearchResult, type Poi } from './poi'
import {
  parseOsrmRoute, fmtDistance, fmtDurationShort,
  type RouteResult, type RouteGeometry,
} from './routing'
import { useSketch } from './useSketch'
import { copyKubunoData, openLabelPicker, pointEnvelope, routeEnvelope, viewEnvelope } from './kubunoData'
import { MapsSketchPanel } from './MapsSketchPanel'
import {
  MapsPlacesPanel,
  type Collection, type HistoryEntry, type PlacePatch,
} from './MapsPlacesPanel'
import { MapsElevationChart, type TrackData } from './MapsElevationChart'
import { useNavigation } from './useNavigation'
import { MapsNavOverlay } from './MapsNavOverlay'
import { registerOfflineProtocol, downloadArea, cachedTileCount, clearOfflineCache } from './mapOffline'
import { MapsCosmos3D } from './MapsCosmos3D'
import { worldById, MOON_FEATURES, MARS_FEATURES, type World } from './worlds'

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
  user_tags: string[]
  collection_id: string | null
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

// POI marker (category search): a white pill with the category emoji, visually
// distinct from saved-place teardrops so an explore result reads as transient.
function makePoiEl(emoji: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.innerHTML = `<div style="background:#fff;border:1.5px solid rgba(0,0,0,.12);
                       border-radius:50%;width:26px;height:26px;
                       display:flex;align-items:center;justify-content:center;
                       font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.3)">
             <span>${emoji}</span>
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

// ── Panneau des résultats d'exploration (POI par catégorie) ─────────────────────

function PoiResultsPanel({
  title, emoji, pois, center, loading, error, onSelect, onClose,
}: {
  title:    string
  emoji:    string
  pois:     Poi[]
  center:   { lat: number; lng: number } | null
  loading:  boolean
  error:    string | null
  onSelect: (p: Poi) => void
  onClose:  () => void
}) {
  const { t } = useTranslation('maps')
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)
  return (
    <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-lg" aria-hidden>{emoji}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary leading-tight truncate">{title}</h2>
          {!loading && !error && (
            <p className="text-[11px] text-text-tertiary">
              {t('maps_poi_count', { count: pois.length, defaultValue: `${pois.length} lieu(x)` })}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary flex-shrink-0">
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-text-tertiary">
            <RefreshCw size={13} className="animate-spin" /> {t('maps_calculating', { defaultValue: 'Recherche…' })}
          </div>
        )}
        {!loading && error && <p className="px-4 py-6 text-xs text-text-tertiary">{error}</p>}
        {!loading && !error && pois.map(p => {
          const dist = center ? haversineM(center.lat, center.lng, p.lat, p.lng) : null
          return (
            <button
              key={`${p.osm_type}-${p.osm_id}`}
              onClick={() => onSelect(p)}
              className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left border-t border-border first:border-t-0 hover:bg-surface-1 transition-colors"
            >
              <span className="text-base mt-0.5 flex-shrink-0" aria-hidden>{p.icon || '📍'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary leading-snug truncate">
                  {p.name || t('maps_poi_unnamed', { defaultValue: 'Lieu sans nom' })}
                </p>
                <p className="text-[11px] text-text-tertiary capitalize truncate">
                  {(p.tags?.cuisine || p.tags?.amenity || p.tags?.shop || p.tags?.tourism || p.category || '').replace(/_/g, ' ')}
                </p>
              </div>
              {dist !== null && <span className="text-[11px] text-text-tertiary flex-shrink-0 mt-0.5">{fmt(dist)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Search panel ──────────────────────────────────────────────────────────────

// Barre de recherche PERMANENTE (façon Google) : toujours visible en haut du
// rail gauche. Les résultats apparaissent en menu déroulant ; quand un lieu est
// sélectionné, la barre affiche son nom (avec une croix pour revenir).
function SearchBar({
  onSelect, onSave, placeTitle, onClear,
}: {
  onSelect:   (r: SearchResult) => void
  onSave:     (r: SearchResult) => void
  placeTitle?: string
  onClear?:   () => void
}) {
  const { t } = useTranslation('maps')
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [open,    setOpen]    = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reflète le lieu sélectionné dans la barre (et vide les résultats).
  useEffect(() => { setQ(placeTitle ?? ''); setResults([]); setError(null) }, [placeTitle])

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(buildNominatimSearchUrl(query))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const raw: Array<Record<string, unknown>> = await res.json()
      setResults(raw.map(mapNominatimResult)); setOpen(true)
    } catch {
      setError(t('maps_geocoding_unavailable')); setResults([])
    } finally { setLoading(false) }
  }, [])

  const onChange = (val: string) => {
    setQ(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  const clear = () => { setQ(''); setResults([]); setError(null); onClear?.() }

  return (
    <div className="relative flex-shrink-0">
      <div className="flex items-center h-12 px-3.5 rounded-full bg-surface-0 shadow-lg border border-border">
        <Search size={17} className="text-text-tertiary flex-shrink-0" />
        <input
          value={q}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t('maps_search_placeholder')}
          className="flex-1 min-w-0 bg-transparent px-2.5 text-sm text-text-primary focus:outline-none"
        />
        {loading && <RefreshCw size={14} className="text-text-tertiary animate-spin flex-shrink-0 mr-1" />}
        {(q.length > 0 || placeTitle) && (
          <button onClick={clear} title={t('common_close', { defaultValue: 'Effacer' })}
            className="text-text-tertiary hover:text-text-primary flex-shrink-0"><X size={17} /></button>
        )}
      </div>

      {open && (results.length > 0 || error) && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-30 bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden max-h-[55vh] overflow-y-auto">
          {error && <p className="px-3 py-3 text-xs text-danger flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
          {results.map(r => (
            <div
              key={r.place_id}
              className="group flex items-start gap-2 px-3 py-2.5 border-t border-border first:border-t-0 hover:bg-surface-1 cursor-pointer"
              onMouseDown={() => { onSelect(r); setResults([]); setOpen(false) }}
            >
              <MapPin size={15} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary leading-snug line-clamp-2">{r.display_name}</p>
                {r.category && <p className="text-[10px] text-text-tertiary capitalize">{r.category}</p>}
              </div>
              <button
                title={t('maps_save_place')}
                onMouseDown={e => { e.stopPropagation(); onSave(r); setResults([]); setOpen(false) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-primary/10 hover:text-primary text-text-tertiary transition-opacity flex-shrink-0"
              ><Plus size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Places panel ──────────────────────────────────────────────────────────────

// ── GPX panel ─────────────────────────────────────────────────────────────────

function GpxPanel({
  traces, onShow, onDelete, onUpload, recording, recStats, onStartRec, onStopRec,
}: {
  traces:   GpxTrace[]
  onShow:   (id: string, name: string) => void
  onDelete: (id: string) => void
  onUpload: (file: File) => void
  recording: boolean
  recStats:  { points: number; dist: number; elapsed: number } | null
  onStartRec: () => void
  onStopRec:  (save: boolean) => void
}) {
  const { t } = useTranslation('maps')
  const inputRef = useRef<HTMLInputElement>(null)
  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-2">
      {/* Enregistrement d'une trace GPS */}
      {recording ? (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-danger/5 border border-danger/30">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" /> {t('maps_rec_active', { defaultValue: 'Enregistrement…' })}
            </span>
            <span className="text-xs font-mono text-text-secondary">{recStats ? fmtElapsed(recStats.elapsed) : '0:00'}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-text-secondary">
            <span>{fmtDist(recStats?.dist ?? 0)}</span>
            <span>{recStats?.points ?? 0} {t('maps_rec_points', { defaultValue: 'points' })}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onStopRec(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover">
              <Check size={13} /> {t('maps_rec_save', { defaultValue: 'Terminer & enregistrer' })}
            </button>
            <button onClick={() => onStopRec(false)} title={t('maps_rec_discard', { defaultValue: 'Abandonner' })}
              className="px-2.5 py-1.5 rounded-lg border border-border text-text-tertiary hover:text-danger hover:bg-surface-1"><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button onClick={onStartRec}
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors">
          <Circle size={11} fill="currentColor" /> {t('maps_rec_start', { defaultValue: 'Enregistrer une trace' })}
        </button>
      )}

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
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onShow(t.id, t.name)}>
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

// Maneuver key → lucide icon node (used by the turn-by-turn list).
function maneuverIcon(key: string, size = 15): React.ReactNode {
  switch (key) {
    case 'depart':       return <ArrowUp size={size} />
    case 'arrive':       return <Flag size={size} />
    case 'slight-right': return <ArrowUpRight size={size} />
    case 'right':        return <ArrowRight size={size} />
    case 'sharp-right':  return <CornerUpRight size={size} />
    case 'slight-left':  return <ArrowUpLeft size={size} />
    case 'left':         return <ArrowLeft size={size} />
    case 'sharp-left':   return <CornerUpLeft size={size} />
    case 'uturn':        return <RotateCcw size={size} />
    case 'roundabout':   return <RotateCw size={size} />
    case 'straight':
    default:             return <ArrowUp size={size} />
  }
}

type RouteMode = 'driving' | 'cycling' | 'foot'

function RoutePanel({
  waypoints, mode, setMode, results, selected, setSelected, loading, error,
  onSetWaypoint, onClearWaypoint, onPickOnMap, onAddStop, onRemoveStop, onMoveStop, onClearAll,
  onStartNav, onSimulateNav,
}: {
  waypoints:    (Waypoint | null)[]
  mode:         RouteMode
  setMode:      (m: RouteMode) => void
  results:      RouteResult[]
  selected:     number
  setSelected:  (i: number) => void
  loading:      boolean
  error:        string | null
  onSetWaypoint:   (index: number, lat: number, lng: number, label?: string) => void
  onClearWaypoint: (index: number) => void
  onPickOnMap:     (index: number) => void
  onAddStop:       () => void
  onRemoveStop:    (index: number) => void
  onMoveStop:      (index: number, dir: -1 | 1) => void
  onClearAll:      () => void
  onStartNav:      () => void
  onSimulateNav:   () => void
}) {
  const { t } = useTranslation('maps')
  const [showSteps, setShowSteps] = useState(true)

  const modes: { id: RouteMode; label: string }[] = [
    { id: 'driving', label: t('maps_mode_driving') },
    { id: 'cycling', label: t('maps_mode_cycling') },
    { id: 'foot',    label: t('maps_mode_foot') },
  ]

  const wpValue = (w: Waypoint | null) =>
    w ? (w.label ?? `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`) : null

  // Couleur de pastille : départ (vert), arrivée (rouge), étapes (bleu).
  const dotColor = (i: number) =>
    i === 0 ? '#1e8e3e' : i === waypoints.length - 1 ? '#d93025' : '#1a73e8'

  const hasAny = waypoints.some(Boolean)
  const sel = results[selected]

  return (
    <div className="flex flex-col gap-3">
      {/* Champs des points (départ → étapes → arrivée) */}
      <div className="flex flex-col gap-1.5">
        {waypoints.map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor(i) }} />
            <div className="flex-1 min-w-0">
              <MapsAddressInput
                value={wpValue(w)} accent={dotColor(i)}
                placeholder={
                  i === 0 ? t('maps_route_from', { defaultValue: 'Point de départ' })
                  : i === waypoints.length - 1 ? t('maps_route_to', { defaultValue: "Point d'arrivée" })
                  : t('maps_route_stop', { defaultValue: 'Étape' })
                }
                onSelect={r => onSetWaypoint(i, parseFloat(r.lat), parseFloat(r.lon), placeDetails(r).title)}
                onClear={() => onClearWaypoint(i)}
              />
            </div>
            <button onClick={() => onPickOnMap(i)} title={t('maps_pick_on_map', { defaultValue: 'Choisir sur la carte' })}
              className="p-1 text-text-tertiary hover:text-primary transition-colors flex-shrink-0">
              <MapPin size={14} />
            </button>
            {/* Réordonner / retirer une étape (seulement si > 2 points) */}
            {waypoints.length > 2 && (
              <div className="flex flex-col -my-1">
                <button onClick={() => onMoveStop(i, -1)} disabled={i === 0}
                  className="text-text-tertiary hover:text-primary disabled:opacity-30 transition-colors"><ChevronUp size={12} /></button>
                <button onClick={() => onMoveStop(i, 1)} disabled={i === waypoints.length - 1}
                  className="text-text-tertiary hover:text-primary disabled:opacity-30 transition-colors"><ChevronDown size={12} /></button>
              </div>
            )}
            {waypoints.length > 2 && (
              <button onClick={() => onRemoveStop(i)} title={t('maps_route_remove_stop', { defaultValue: 'Retirer' })}
                className="p-1 text-text-tertiary hover:text-danger transition-colors flex-shrink-0"><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        <button onClick={onAddStop}
          className="self-start flex items-center gap-1 px-1 text-[11px] text-primary hover:underline">
          <Plus size={12} /> {t('maps_route_add_stop', { defaultValue: 'Ajouter une étape' })}
        </button>
      </div>

      {/* Mode de transport */}
      <div className="flex gap-1">
        {modes.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
              mode === m.id ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
            }`}>{m.label}</button>
        ))}
      </div>

      {loading && (
        <p className="text-xs text-text-tertiary flex items-center gap-1.5">
          <RefreshCw size={12} className="animate-spin" /> {t('maps_calculating')}
        </p>
      )}
      {error && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}

      {/* Itinéraires alternatifs sélectionnables */}
      {!loading && results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((r, i) => (
            <button key={i} onClick={() => setSelected(i)}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                i === selected ? 'border-primary bg-primary-light' : 'border-border bg-surface-0 hover:bg-surface-1'
              }`}>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${i === selected ? 'text-primary' : 'text-text-primary'}`}>
                  {fmtDurationShort(r.duration)}
                </p>
                <p className="text-[11px] text-text-tertiary">
                  {i === 0
                    ? t('maps_route_best', { defaultValue: 'Meilleur itinéraire' })
                    : t('maps_route_alt', { defaultValue: 'Variante' })}
                </p>
              </div>
              <span className="text-xs text-text-secondary flex-shrink-0">{fmtDistance(r.distance)}</span>
            </button>
          ))}
          {/* Démarrer la navigation guidée */}
          <div className="flex gap-2 mt-0.5">
            <button onClick={onStartNav}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors">
              <Navigation size={14} /> {t('maps_nav_start', { defaultValue: 'Démarrer' })}
            </button>
            <button onClick={onSimulateNav} title={t('maps_nav_simulate', { defaultValue: 'Simuler le trajet' })}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-text-secondary text-xs font-medium hover:bg-surface-1 transition-colors">
              <Play size={13} /> {t('maps_nav_sim', { defaultValue: 'Simulation' })}
            </button>
          </div>
        </div>
      )}

      {/* Feuille de route virage-par-virage */}
      {!loading && sel && sel.steps.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button onClick={() => setShowSteps(s => !s)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-surface-1 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            <span className="flex items-center gap-1.5"><List size={13} /> {t('maps_route_steps', { defaultValue: 'Feuille de route' })} · {sel.steps.length}</span>
            {showSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showSteps && (
            <div className="max-h-64 overflow-y-auto">
              {sel.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2 border-t border-border first:border-t-0">
                  <span className="text-text-tertiary mt-0.5 flex-shrink-0">{maneuverIcon(s.iconKey)}</span>
                  <p className="flex-1 min-w-0 text-xs text-text-primary leading-snug">{s.text}</p>
                  {s.distance > 0 && <span className="text-[11px] text-text-tertiary flex-shrink-0 mt-0.5">{fmtDistance(s.distance)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasAny && (
        <button onClick={onClearAll} className="text-xs text-text-tertiary hover:text-danger flex items-center gap-1 transition-colors">
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
// Les « chips » de catégories (Restaurants, Musées, Cinémas…) sont déclarées dans
// `poi.ts` (POI_CHIPS) et déclenchent une recherche POI via le proxy Overpass.

// Haversine distance (meters) — used to size the explore radius from the viewport.
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const la1 = aLat * Math.PI / 180, la2 = bLat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { t, i18n } = useTranslation('maps')
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
  const [mapReady, setMapReady] = useState(false)

  // Croquis (mesure / dessin / annotations) — moteur de dessin sur la carte.
  const sketch = useSketch(mapRef, mapReady)

  // Onglet actif partagé avec la nav de la sidebar du core (MapsSidebarBody).
  const tab    = useMapsUiStore(s => s.tab)
  const setTab = useMapsUiStore(s => s.setTab)
  const [places,    setPlaces]    = useState<Place[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [history,   setHistory]   = useState<HistoryEntry[]>([])
  const [traces,    setTraces]    = useState<GpxTrace[]>([])
  // Profil d'élévation de la trace GPX affichée.
  const [trackData, setTrackData] = useState<{ name: string; data: TrackData } | null>(null)
  // Itinéraire avancé : ≥ 2 points (départ → étapes → arrivée), null = vide.
  const [waypoints, setWaypoints] = useState<(Waypoint | null)[]>([null, null])
  const [routePickMode, setRoutePickMode] = useState<number | null>(null)
  const [routeMode,     setRouteMode]     = useState<RouteMode>('driving')
  const [routeResults,  setRouteResults]  = useState<RouteResult[]>([])
  const [selectedRoute, setSelectedRoute] = useState(0)
  const [routeLoading,  setRouteLoading]  = useState(false)
  const [routeError,    setRouteError]    = useState<string | null>(null)

  // Navigation temps réel (guidage virage-par-virage) sur l'itinéraire sélectionné.
  const nav = useNavigation(mapRef, routeResults[selectedRoute] ?? null, {
    onOffRoute: (lat, lng) => setWaypoints(wp => { const n = [...wp]; n[0] = { lat, lng }; return n }),
  })

  const [ctxMenu,   setCtxMenu]   = useState<{ x: number; y: number; lat: number; lng: number; name?: string } | null>(null)
  const [saveModal, setSaveModal] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null)

  // ── Enregistrement d'une trace GPS ──
  const [recording, setRecording] = useState(false)
  const [recStats,  setRecStats]  = useState<{ points: number; dist: number; elapsed: number } | null>(null)
  const recPtsRef   = useRef<{ lng: number; lat: number; ele: number | null; time: string }[]>([])
  const recWatchRef = useRef<number | null>(null)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartRef = useRef<number>(0)

  // ── Exploration POI (chips de catégories) ──
  const [pois,        setPois]        = useState<Poi[]>([])
  const [activeCat,   setActiveCat]   = useState<string | null>(null)
  const [poiLoading,  setPoiLoading]  = useState(false)
  const [poiError,    setPoiError]    = useState<string | null>(null)
  // Centre de la dernière recherche POI (pour trier les résultats par distance).
  const [poiCenter,   setPoiCenter]   = useState<{ lat: number; lng: number } | null>(null)

  // ── État du panneau « Couches » ──
  const [layersOpen, setLayersOpen] = useState(false)
  const [baseMap,    setBaseMap]    = useState<BaseMap>('default')
  const [showLabels, setShowLabels] = useState(true)
  const [globe,      setGlobe]      = useState(true)
  const [cycle,      setCycle]      = useState(false)
  const [relief,     setRelief]     = useState(false)
  const [transit,    setTransit]    = useState(false)
  const [precip,     setPrecip]     = useState(false)
  const [terrain3d,  setTerrain3d]  = useState(false)
  // Calques importés (GeoJSON / KML) : id → nom de fichier ; data conservée en ref
  // pour pouvoir les redessiner après un changement de fond (setStyle).
  const [imports,    setImports]    = useState<{ id: string; name: string }[]>([])
  const importSeq = useRef(0)
  const importDataRef = useRef<Record<string, unknown>>({})

  // ── Accessibilité / hors-ligne (VAGUE 8) ──
  const [highContrast, setHighContrast] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  // Mondes / cosmos (Terre, Lune, Mars…).
  const [worldId, setWorldId] = useState('earth')
  const [cosmosOpen, setCosmosOpen] = useState(false)
  const [warping, setWarping] = useState(false)   // transition cinématique entre mondes
  const cosmosAutoRef = useRef(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [cachedTiles, setCachedTiles] = useState(0)
  const [dlProgress, setDlProgress] = useState<{ done: number; total: number } | null>(null)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    registerOfflineProtocol(maplibregl)   // protocole kbtile:// (cache-first hors-ligne)

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: DEFAULT_STYLE,
      center: [2.3522, 48.8566],   // [lng, lat]
      zoom: 11,
    })
    // Projection globe (dezoom → planète entière) : à appliquer UNE FOIS le style
    // chargé, sinon MapLibre lève « Style is not done loading » et plante la page.
    map.on('load', () => {
      try { map.setProjection({ type: 'globe' }) } catch { /* ignore */ }
      // Halo atmosphérique bleuté de la Terre (visible sur le globe dézoomé).
      try {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 6, 0] as unknown as number, 'sky-color': '#5a9be0', 'horizon-color': '#bcd9f5', 'fog-color': '#dfecfb' })
      } catch { /* setSky indispo */ }
      setMapReady(true)
    })

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

    // Click on map — remplit le point d'itinéraire en cours de sélection.
    map.on('click', (e) => {
      setRoutePickMode(idx => {
        if (idx === null) return idx
        setWaypoints(wp => { const n = [...wp]; n[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }; return n })
        return null
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

  // ── Données perso : listes (collections) + historique de recherche ─────────────
  const loadCollections = useCallback(async () => {
    try {
      const { data } = await api.get<{ collections: Collection[] }>('/maps/collections')
      setCollections(data.collections ?? [])
    } catch {/* ignore */}
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get<{ history: HistoryEntry[] }>('/maps/search/history')
      setHistory(data.history ?? [])
    } catch {/* ignore */}
  }, [])

  const createCollection = useCallback(async (name: string, color: string) => {
    try {
      await api.post('/maps/collections', { name, color })
      await loadCollections()
    } catch {/* ignore */}
  }, [loadCollections])

  const deleteCollection = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/collections/${id}`)
      await Promise.all([loadCollections(), loadPlaces()])
    } catch {/* ignore */}
  }, [loadCollections, loadPlaces])

  const updatePlace = useCallback(async (id: string, patch: PlacePatch) => {
    try {
      await api.patch(`/maps/places/${id}`, patch)
      await Promise.all([loadPlaces(), loadCollections()])
    } catch {/* ignore */}
  }, [loadPlaces, loadCollections])

  const clearHistory = useCallback(async () => {
    try {
      await api.delete('/maps/search/history')
      setHistory([])
    } catch {/* ignore */}
  }, [])

  // Exporte tous les lieux enregistrés en GeoJSON (téléchargement client).
  const exportPlaces = useCallback(() => {
    const fc = {
      type: 'FeatureCollection',
      features: places.map(p => ({
        type: 'Feature',
        properties: { name: p.name, category: p.category, note: p.user_note, tags: p.user_tags, icon: p.icon, address: p.address },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kubuno-lieux.geojson'; a.click()
    URL.revokeObjectURL(url)
  }, [places])

  // Importe des lieux depuis un GeoJSON (chaque Point devient un lieu enregistré).
  const importPlaces = useCallback(async (file: File) => {
    try {
      const fc = JSON.parse(await file.text()) as { features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: [number, number] } }[] }
      const feats = (fc.features ?? []).filter(f => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
      for (const f of feats) {
        const [lng, lat] = f.geometry!.coordinates as [number, number]
        const p = f.properties ?? {}
        await api.post('/maps/places', {
          name: String(p.name ?? 'Lieu importé'),
          lat, lng,
          address: (p.address as string) ?? null,
          user_note: (p.note as string) ?? null,
          user_tags: Array.isArray(p.tags) ? p.tags : [],
          icon: (p.icon as string) ?? '📍',
        })
      }
      await loadPlaces()
    } catch {/* fichier invalide : ignoré */}
  }, [loadPlaces])

  useEffect(() => { loadPlaces(); loadTraces(); loadCollections(); loadHistory() },
    [loadPlaces, loadTraces, loadCollections, loadHistory])

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
      const el = makePlaceEl(p.icon)
      // Clic droit sur un lieu enregistré → menu contextuel riche.
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation()
        setCtxMenu({ x: e.clientX, y: e.clientY, lat: p.lat, lng: p.lng, name: p.name })
      })
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
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

  // ── Route waypoint markers (A, B, C… par position) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.keys(markersRef.current).forEach(k => {
      if (k.startsWith('wp-')) { markersRef.current[k].remove(); delete markersRef.current[k] }
    })
    waypoints.forEach((wp, i) => {
      if (!wp) return
      const m = new maplibregl.Marker({ element: makeWaypointEl(String.fromCharCode(65 + i)) })
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

  // ── Exploration : recherche de POI par catégorie dans la vue courante ─────────
  // Un nouveau clic sur la catégorie active l'efface (bascule). Le rayon suit
  // l'emprise visible (distance centre → coin), borné [300 m ; 6 km].
  // `center` fourni (depuis le menu contextuel) → recherche autour de ce point et
  // recentre ; sans `center`, on utilise le centre de la vue (chips), avec bascule.
  const searchCategory = useCallback(async (chip: typeof POI_CHIPS[number], center?: { lat: number; lng: number }) => {
    const map = mapRef.current
    if (!map) return
    if (!center && activeCat === chip.key) {   // bascule : on masque (chips seulement)
      setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null)
      return
    }
    setActiveCat(chip.key); setPoiError(null); setPoiLoading(true)
    clearSelectedPlace()
    const mc = map.getCenter()
    const c = center ?? { lat: mc.lat, lng: mc.lng }
    const ne = map.getBounds().getNorthEast()
    const radius = Math.min(6000, Math.max(300, haversineM(c.lat, c.lng, ne.lat, ne.lng)))
    setPoiCenter({ lat: c.lat, lng: c.lng })
    if (center) flyTo(c.lat, c.lng)
    try {
      const found = await fetchNearbyPois(c.lat, c.lng, radius, chip.cats, 150)
      // Tri par distance au centre de recherche (les plus proches d'abord).
      found.sort((a, p) =>
        haversineM(c.lat, c.lng, a.lat, a.lng) - haversineM(c.lat, c.lng, p.lat, p.lng))
      setPois(found)
      if (found.length === 0) setPoiError(t('maps_poi_none', { defaultValue: 'Aucun résultat dans cette zone' }))
    } catch {
      setPois([])
      setPoiError(t('maps_poi_error', { defaultValue: 'Exploration indisponible' }))
    } finally {
      setPoiLoading(false)
    }
  }, [activeCat, clearSelectedPlace, flyTo, t])

  // Ouvre le panneau d'infos pour un POI (clic sur son marqueur).
  const selectPoi = useCallback((p: Poi) => {
    setSelectedPlace(poiToSearchResult(p))
    flyTo(p.lat, p.lng, Math.max(16, mapRef.current?.getZoom() ?? 16))
  }, [flyTo])

  // « À proximité » : recherche POI large autour d'un lieu (toutes catégories utiles).
  const exploreNearby = useCallback(async (lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return
    const cats = ['restaurant', 'cafe', 'bar', 'fast_food', 'hotel', 'supermarket', 'pharmacy',
      'atm', 'museum', 'attraction', 'park', 'cinema', 'transit', 'parking']
    setActiveCat('nearby'); setPoiError(null); setPoiLoading(true)
    setSelectedPlace(null)
    setPoiCenter({ lat, lng })
    flyTo(lat, lng, Math.min(16, mapRef.current?.getZoom() ?? 15))
    const ne = map.getBounds().getNorthEast()
    const radius = Math.min(3000, Math.max(300, haversineM(lat, lng, ne.lat, ne.lng)))
    try {
      const found = await fetchNearbyPois(lat, lng, radius, cats, 200)
      found.sort((a, b) => haversineM(lat, lng, a.lat, a.lng) - haversineM(lat, lng, b.lat, b.lng))
      setPois(found)
      if (found.length === 0) setPoiError(t('maps_poi_none', { defaultValue: 'Aucun résultat dans cette zone' }))
    } catch {
      setPois([]); setPoiError(t('maps_poi_error', { defaultValue: 'Exploration indisponible' }))
    } finally { setPoiLoading(false) }
  }, [flyTo, t])

  // ── Sync des marqueurs POI ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key.startsWith('poi-')) { marker.remove(); delete markersRef.current[key] }
    })
    pois.forEach(p => {
      const el = makePoiEl(p.icon || '📍')
      el.addEventListener('click', (e) => { e.stopPropagation(); selectPoi(p) })
      // Clic droit sur un POI → menu contextuel riche centré sur ce lieu.
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation()
        setCtxMenu({ x: e.clientX, y: e.clientY, lat: p.lat, lng: p.lng, name: p.name ?? undefined })
      })
      const m = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .addTo(map)
      markersRef.current[`poi-${p.osm_type}-${p.osm_id}`] = m
    })
  }, [pois, selectPoi])

  // « Itinéraire » depuis le panneau d'un lieu → en fait la destination (B) et
  // bascule sur l'onglet itinéraire.
  const routeToPlace = useCallback((lat: number, lng: number, label: string) => {
    // Le lieu devient la destination (dernier point).
    setWaypoints(wp => { const n = [...wp]; n[n.length - 1] = { lat, lng, label }; return n })
    setRoutePickMode(null)
    clearSelectedPlace()
    setTab('route')
  }, [clearSelectedPlace, setTab])

  // Changer d'onglet (via la nav de la sidebar) ferme le panneau d'infos du lieu
  // ET l'exploration par catégorie (sinon le panneau POI masquerait l'onglet).
  useEffect(() => {
    clearSelectedPlace()
    setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null)
    if (tab !== 'sketch') sketch.setTool('none')   // pas de dessin hors de l'onglet Croquis
  }, [tab, clearSelectedPlace])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save place from search ────────────────────────────────────────────────────
  const saveFromSearch = useCallback((r: SearchResult) => {
    setSaveModal({
      lat:  parseFloat(r.lat),
      lng:  parseFloat(r.lon),
      name: r.display_name.split(',')[0].trim(),
    })
    flyTo(parseFloat(r.lat), parseFloat(r.lon))
  }, [flyTo])

  // « Qu'y a-t-il ici ? » — géocodage inverse du point cliqué → panneau d'infos.
  const whatIsHere = useCallback(async (lat: number, lng: number) => {
    setCtxMenu(null)
    flyTo(lat, lng, Math.max(15, mapRef.current?.getZoom() ?? 15))
    try {
      const res = await fetch(buildNominatimReverseUrl(lat, lng))
      if (!res.ok) return
      const raw = await res.json()
      const r = mapNominatimResult(raw)
      setSelectedPlace({ ...r, lat: String(lat), lon: String(lng) })
    } catch {/* indisponible : silencieux */}
  }, [flyTo])

  // Copie « lat, lng » dans le presse-papier.
  const copyCoords = useCallback((lat: number, lng: number) => {
    navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`).catch(() => {})
    setCtxMenu(null)
  }, [])

  // Lien de partage profond `?ll=lat,lng` : ouvre le lieu à l'arrivée sur /maps.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (!mapReady || deepLinkDone.current) return
    const params = new URLSearchParams(window.location.search)
    const ll = params.get('ll')
    if (ll && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(ll)) {
      deepLinkDone.current = true
      const [la, ln] = ll.split(',').map(Number)
      whatIsHere(la, ln)
    }
  }, [mapReady, whatIsHere])

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

  // ── Enregistrement d'une trace depuis le GPS (geolocation) ─────────────────────
  const updateRecLine = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const coords = recPtsRef.current.map(p => [p.lng, p.lat] as [number, number])
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }
    const src = map.getSource('rec-line') as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(data as Parameters<maplibregl.GeoJSONSource['setData']>[0])
  }, [])

  const startRecording = useCallback(() => {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return
    recPtsRef.current = []
    recStartRef.current = Date.now()
    setRecording(true)
    setRecStats({ points: 0, dist: 0, elapsed: 0 })
    setTab('gpx')

    const draw = () => {
      if (!map.getSource('rec-line')) {
        map.addSource('rec-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'rec-line', type: 'line', source: 'rec-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#d93025', 'line-width': 4, 'line-opacity': 0.9 },
        })
        lineIdsRef.current.add('rec-line')
      }
    }
    if (map.isStyleLoaded()) draw(); else map.once('load', draw)

    recWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const c = pos.coords
        const pts = recPtsRef.current
        const prev = pts[pts.length - 1]
        pts.push({ lng: c.longitude, lat: c.latitude, ele: c.altitude, time: new Date().toISOString() })
        updateRecLine()
        const added = prev ? haversineM(prev.lat, prev.lng, c.latitude, c.longitude) : 0
        setRecStats(s => ({
          points: pts.length,
          dist: (s?.dist ?? 0) + added,
          elapsed: Math.round((Date.now() - recStartRef.current) / 1000),
        }))
        map.easeTo({ center: [c.longitude, c.latitude], duration: 500 })
      },
      () => {/* permission refusée : on laisse l'utilisateur arrêter */},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )
    // Met à jour le chrono même sans nouveau point.
    recTimerRef.current = setInterval(() => {
      setRecStats(s => (s ? { ...s, elapsed: Math.round((Date.now() - recStartRef.current) / 1000) } : s))
    }, 1000)
  }, [setTab, updateRecLine])

  const stopRecording = useCallback(async (save: boolean) => {
    if (recWatchRef.current != null) { navigator.geolocation?.clearWatch(recWatchRef.current); recWatchRef.current = null }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    const map = mapRef.current
    if (map) {
      if (map.getLayer('rec-line')) map.removeLayer('rec-line')
      if (map.getSource('rec-line')) map.removeSource('rec-line')
      lineIdsRef.current.delete('rec-line')
    }
    const pts = recPtsRef.current
    setRecording(false); setRecStats(null)

    if (save && pts.length >= 2) {
      const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))
      const name = `Trace ${new Date().toLocaleString('fr-FR')}`
      const seg = pts.map(p =>
        `<trkpt lat="${p.lat}" lon="${p.lng}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}<time>${p.time}</time></trkpt>`,
      ).join('')
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kubuno Maps"><trk><name>${esc(name)}</name><trkseg>${seg}</trkseg></trk></gpx>`
      setUploading(true)
      try {
        await api.post('/maps/gpx', gpx, {
          headers: { 'Content-Type': 'application/gpx+xml' },
          params:  { name, activity_type: 'other' },
        })
        await loadTraces()
      } catch {/* ignore */} finally { setUploading(false) }
    }
    recPtsRef.current = []
  }, [loadTraces])

  const showGpx = useCallback(async (id: string, name?: string) => {
    const map = mapRef.current
    if (!map) return
    // Profil d'élévation + stats détaillées (endpoint dédié).
    api.get<{ track: TrackData }>(`/maps/gpx/${id}/track`)
      .then(({ data }) => setTrackData({ name: name ?? 'Trace', data: data.track }))
      .catch(() => {/* pas de profil : on garde juste le tracé */})
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

  // Exporte la trace affichée en GeoJSON (LineString avec élévations).
  const exportTrackGeoJSON = useCallback(() => {
    if (!trackData) return
    const coords = trackData.data.points.map(p => (p.ele != null ? [p.lng, p.lat, p.ele] : [p.lng, p.lat]))
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: trackData.name,
          distance_m: trackData.data.distance_meters,
          gain_m: trackData.data.elevation_gain,
          loss_m: trackData.data.elevation_loss,
        },
        geometry: { type: 'LineString', coordinates: coords },
      }],
    }
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${trackData.name.replace(/[^\w-]+/g, '_')}.geojson`; a.click()
    URL.revokeObjectURL(url)
  }, [trackData])

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
  const setWaypointAt = useCallback((index: number, lat: number, lng: number, label?: string) => {
    setWaypoints(wp => { const n = [...wp]; n[index] = { lat, lng, label }; return n })
    setRoutePickMode(null)
  }, [])

  const clearWaypointAt = useCallback((index: number) => {
    setWaypoints(wp => { const n = [...wp]; n[index] = null; return n })
  }, [])

  // Ajoute une étape vide juste avant la destination (façon Google Maps).
  const addStop = useCallback(() => {
    setWaypoints(wp => { const n = [...wp]; n.splice(Math.max(1, n.length - 1), 0, null); return n })
  }, [])

  // Retire une étape (on garde toujours au moins 2 points).
  const removeStop = useCallback((index: number) => {
    setWaypoints(wp => (wp.length <= 2 ? wp : wp.filter((_, i) => i !== index)))
  }, [])

  // Réordonne une étape (monter/descendre).
  const moveStop = useCallback((index: number, dir: -1 | 1) => {
    setWaypoints(wp => {
      const j = index + dir
      if (j < 0 || j >= wp.length) return wp
      const n = [...wp];[n[index], n[j]] = [n[j], n[index]]; return n
    })
  }, [])

  // Retire tous les calques de tracé d'itinéraire (route-*).
  const clearRouteLines = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    Array.from(lineIdsRef.current).forEach(id => {
      if (id.startsWith('route-')) {
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
        lineIdsRef.current.delete(id)
      }
    })
  }, [])

  // Dessine les itinéraires : variantes en gris (dessous) + sélectionné en bleu (dessus).
  const drawRoutes = useCallback((results: RouteResult[], selIdx: number) => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      Array.from(lineIdsRef.current).forEach(id => {
        if (id.startsWith('route-')) {
          if (map.getLayer(id)) map.removeLayer(id)
          if (map.getSource(id)) map.removeSource(id)
          lineIdsRef.current.delete(id)
        }
      })
      results.forEach((r, i) => {
        if (i === selIdx) return
        const g = r.geometry
        if (!g || !Array.isArray(g.coordinates) || !g.coordinates.length) return
        const id = `route-alt-${i}`
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: { idx: i }, geometry: g } })
        map.addLayer({
          id, type: 'line', source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:  { 'line-color': '#9aa0a6', 'line-width': 5, 'line-opacity': 0.7 },
        })
        lineIdsRef.current.add(id)
      })
      const sel = results[selIdx]
      if (sel?.geometry && Array.isArray(sel.geometry.coordinates) && sel.geometry.coordinates.length) {
        const id = 'route-line'
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: sel.geometry } })
        map.addLayer({
          id, type: 'line', source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:  { 'line-color': '#1a73e8', 'line-width': 6, 'line-opacity': 0.9 },
        })
        lineIdsRef.current.add(id)
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [])

  // Cadre la vue sur une géométrie d'itinéraire.
  const fitToRoute = useCallback((g: RouteGeometry | null) => {
    const map = mapRef.current
    if (!map || !g || !Array.isArray(g.coordinates) || !g.coordinates.length) return
    const b = new maplibregl.LngLatBounds(g.coordinates[0], g.coordinates[0])
    g.coordinates.forEach(c => b.extend(c as [number, number]))
    map.fitBounds(b, { padding: 60, duration: 800 })
  }, [])

  // Calcule les itinéraires (variantes + virage-par-virage) via OSRM.
  const calculateRoutes = useCallback(async () => {
    const pts = waypoints.filter(Boolean) as Waypoint[]
    if (pts.length < 2) { setRouteResults([]); setRouteError(null); return }
    setRouteLoading(true); setRouteError(null)
    try {
      const { data } = await api.post<{ routes: Parameters<typeof parseOsrmRoute>[0][] }>(
        '/maps/routes',
        {
          waypoints:    pts.map(w => ({ lat: w.lat, lng: w.lng })),
          mode:         routeMode,
          alternatives: true,
          steps:        true,
        },
      )
      const raw = data.routes ?? []
      if (!raw.length) { setRouteResults([]); setRouteError(t('maps_route_none')); return }
      const lang = i18n.language || 'fr'
      const parsed = raw.map(r => parseOsrmRoute(r, lang))
      setRouteResults(parsed)
      setSelectedRoute(0)
      fitToRoute(parsed[0].geometry)
    } catch {
      setRouteResults([]); setRouteError(t('maps_route_service_unavailable'))
    } finally {
      setRouteLoading(false)
    }
  }, [waypoints, routeMode, t, i18n, fitToRoute])

  // Recalcule automatiquement dès que les points (tous définis) ou le mode changent.
  const wpKey = waypoints.map(w => (w ? `${w.lat},${w.lng}` : '∅')).join('|')
  useEffect(() => {
    const ready = waypoints.filter(Boolean).length >= 2
    if (ready) calculateRoutes()
    else { setRouteResults([]); setRouteError(null); clearRouteLines() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpKey, routeMode])

  // Redessine quand le set de résultats ou la sélection change.
  useEffect(() => {
    drawRoutes(routeResults, selectedRoute)
  }, [routeResults, selectedRoute, drawRoutes])

  const clearRoute = useCallback(() => {
    setWaypoints([null, null])
    setRouteResults([]); setSelectedRoute(0); setRouteError(null)
    clearRouteLines()
  }, [clearRouteLines])

  // ── Couches : type de fond + calques + bascules ──
  // Changer de fond recharge le style ; on réapplique projection, libellés,
  // calques actifs et le tracé d'itinéraire une fois le nouveau style chargé.
  const switchBase = (b: BaseMap) => {
    setBaseMap(b)
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleFor(b))
    map.once('styledata', () => {
      applyProjection(map, globe)
      applyLabels(map, b, showLabels)
      if (cycle)    applyCycle(map, true)
      if (relief)   applyRelief(map, true)
      if (transit)  applyTransit(map, true)
      if (precip)   applyPrecip(map, true)
      if (terrain3d) applyTerrain3D(map, true)
      imports.forEach(im => addImportLayer(map, im.id, importDataRef.current[im.id]))
      if (routeResults.length) drawRoutes(routeResults, selectedRoute)
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
  const toggleTransit = () => {
    const next = !transit; setTransit(next)
    if (mapRef.current) applyTransit(mapRef.current, next)
  }
  const togglePrecip = () => {
    const next = !precip; setPrecip(next)
    if (mapRef.current) applyPrecip(mapRef.current, next)
  }
  const toggleTerrain3d = () => {
    const next = !terrain3d; setTerrain3d(next)
    if (mapRef.current) applyTerrain3D(mapRef.current, next)
  }

  // Importer un fichier GeoJSON/KML et l'ajouter comme calque (+ cadrage).
  const importFile = useCallback(async (file: File) => {
    const map = mapRef.current
    if (!map) return
    try {
      const text = await file.text()
      const data = file.name.toLowerCase().endsWith('.kml')
        ? kmlToGeoJSON(text)
        : JSON.parse(text)
      const id = `imp${importSeq.current++}`
      importDataRef.current[id] = data
      addImportLayer(map, id, data)
      setImports(prev => [...prev, { id, name: file.name }])
      const b = geoJsonBounds(data)
      if (b) map.fitBounds(b, { padding: 60, duration: 800 })
    } catch { /* fichier invalide : ignoré */ }
  }, [])

  const removeImport = useCallback((id: string) => {
    if (mapRef.current) removeImportLayer(mapRef.current, id)
    delete importDataRef.current[id]
    setImports(prev => prev.filter(im => im.id !== id))
  }, [])

  // ── Hors-ligne : télécharge les tuiles de la zone visible dans le cache ─────────
  const refreshCacheCount = useCallback(() => { cachedTileCount().then(setCachedTiles) }, [])

  const downloadVisibleArea = useCallback(async () => {
    const map = mapRef.current
    if (!map || dlProgress) return
    const b = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const z = Math.round(map.getZoom())
    // De (zoom−1) à (zoom+2), borné [3 ; 17] — compromis couverture / quantité.
    const minZ = Math.max(3, z - 1), maxZ = Math.min(17, z + 2)
    setDlProgress({ done: 0, total: 1 })
    await downloadArea(bbox, minZ, maxZ, (done, total) => setDlProgress({ done, total }))
    setDlProgress(null)
    refreshCacheCount()
  }, [dlProgress, refreshCacheCount])

  const clearTiles = useCallback(async () => {
    await clearOfflineCache()
    refreshCacheCount()
  }, [refreshCacheCount])

  // Compte initial + suivi de l'état en ligne / hors-ligne.
  useEffect(() => {
    refreshCacheCount()
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [refreshCacheCount])

  // Contraste élevé : filtre CSS appliqué au conteneur de la carte.
  useEffect(() => {
    const el = mapDivRef.current
    if (el) el.style.filter = highContrast ? 'contrast(1.3) saturate(1.25)' : ''
  }, [highContrast])

  // ── Raccourcis clavier (accessibilité) ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return  // ne pas gêner la saisie
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case '?': setShowShortcuts(s => !s); break
        case 'l': case 'L': setLayersOpen(o => !o); break
        case 's': case 'S': setTab('search'); break
        case 'p': case 'P': setTab('places'); break
        case 'r': case 'R': setTab('route'); break
        case 'g': case 'G': setTab('gpx'); break
        case 'd': case 'D': setTab('sketch'); break
        case '+': case '=': mapRef.current?.zoomIn(); break
        case '-': case '_': mapRef.current?.zoomOut(); break
        case 'Escape': setShowShortcuts(false); setLayersOpen(false); clearSelectedPlace(); break
        default: return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, clearSelectedPlace])

  // Halo atmosphérique par astre : Terre bleutée, Lune sans atmosphère, Mars
  // poussière rosée. (MapLibre 5 `setSky` + atmosphere-blend sur le globe.)
  const applyWorldSky = useCallback((map: maplibregl.Map, id: string) => {
    try {
      if (id === 'moon') {
        map.setSky({ 'atmosphere-blend': 0, 'sky-color': '#05060a', 'horizon-color': '#101216', 'fog-color': '#0a0c10' })
      } else if (id === 'mars') {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 5, 0] as unknown as number, 'sky-color': '#d9a07a', 'horizon-color': '#e7b48a', 'fog-color': '#caa07e' })
      } else {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 6, 0] as unknown as number, 'sky-color': '#5a9be0', 'horizon-color': '#bcd9f5', 'fog-color': '#dfecfb' })
      }
    } catch { /* setSky indispo : ignore */ }
  }, [])

  // Étiquettes de repères de surface (cratères/mers/monts) sur Lune & Mars.
  const applyBodyLabels = useCallback((map: maplibregl.Map, id: string) => {
    const feats = (id === 'moon' ? MOON_FEATURES : id === 'mars' ? MARS_FEATURES : [])
      .map(f => ({ type: 'Feature' as const, properties: { name: f.name }, geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] } }))
    const sid = 'body-labels'
    if (map.getLayer(`${sid}-dot`)) map.removeLayer(`${sid}-dot`)
    if (map.getLayer(sid)) map.removeLayer(sid)
    if (map.getSource(sid)) map.removeSource(sid)
    if (!feats.length) return
    map.addSource(sid, { type: 'geojson', data: { type: 'FeatureCollection', features: feats } })
    map.addLayer({ id: `${sid}-dot`, type: 'circle', source: sid, paint: { 'circle-radius': 2.5, 'circle-color': '#ffd24a', 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(0,0,0,.5)' } })
    map.addLayer({
      id: sid, type: 'symbol', source: sid,
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.5], 'text-allow-overlap': false },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.4 },
    })
  }, [])

  // ── Mondes / cosmos : voyager vers un autre astre (Lune, Mars…) ────────────────
  // Transition cinématique : fondu spatial → changement de carte → fondu sortant.
  const travelTo = useCallback((w: World) => {
    const map = mapRef.current
    if (!map) return
    setCosmosOpen(false); cosmosAutoRef.current = true
    setWarping(true)
    clearSelectedPlace(); clearRouteLines()
    window.setTimeout(() => {
      setWorldId(w.id)
      const after = () => {
        applyProjection(map, globe)
        applyWorldSky(map, w.id)
        if (w.id !== 'earth') applyBodyLabels(map, w.id)
        const center = (w.id === 'earth' ? [2.3522, 48.8566] : (w.center ?? [0, 0])) as [number, number]
        const z = w.id === 'earth' ? 4 : (w.zoom ?? 2)
        // Arrivée naturelle : le globe apparaît petit (dézoomé) puis on zoome dessus.
        map.jumpTo({ center, zoom: 0.8 })
        map.flyTo({ center, zoom: z, duration: 2600, essential: true })
        window.setTimeout(() => setWarping(false), 950)
      }
      map.setStyle(w.id === 'earth' ? styleFor(baseMap) : w.style!())
      map.once('styledata', after)
    }, 480)
  }, [baseMap, globe, clearSelectedPlace, clearRouteLines, applyWorldSky])

  // Ouvre le cosmos avec un bref fondu spatial (transition naturelle map→3D).
  const openCosmos = useCallback(() => {
    cosmosAutoRef.current = true
    setWarping(true); setCosmosOpen(true)
    window.setTimeout(() => setWarping(false), 520)
  }, [])

  const closeCosmos = useCallback(() => {
    setCosmosOpen(false); cosmosAutoRef.current = true
    if (worldId === 'earth' && mapRef.current && mapRef.current.getZoom() < 2.4) {
      mapRef.current.easeTo({ zoom: 3.5, duration: 800 })
    }
  }, [worldId])

  // Ouvre automatiquement le cosmos quand on dézoome à fond (façon « sortir dans l'espace »).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onZoom = () => {
      const z = map.getZoom()
      if (z > 2.6) cosmosAutoRef.current = false           // réarme une fois revenu
      else if (z <= 1.6 && !cosmosAutoRef.current && !cosmosOpen) {
        openCosmos()
      }
    }
    map.on('zoom', onZoom)
    return () => { map.off('zoom', onZoom) }
  }, [mapReady, cosmosOpen, openCosmos])

  // ── Cursor during route pick ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = routePickMode !== null ? 'crosshair' : ''
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
    <div className={`relative h-full overflow-hidden ${globe ? 'maps-space' : ''}`}
      style={globe ? undefined : { background: '#e8eaed' }}>
      {/* Carte plein écran (moteur MapLibre GL — tuiles vectorielles OpenFreeMap, projection globe).
          NB : on utilise w-full/h-full et NON `absolute inset-0` car maplibre-gl.css force
          `.maplibregl-map { position: relative }`, ce qui écraserait le positionnement absolu
          et ferait retomber le canvas à sa hauteur par défaut (300px → carte invisible). */}
      <div ref={mapDivRef} className="w-full h-full" />

      {/* ── Rail gauche pleine hauteur : barre de recherche PERMANENTE + contenu ──
          La barre de recherche reste toujours visible (façon Google) ; le panneau
          (lieu / résultats / onglet) occupe toute la hauteur sous la barre. */}
      <div className="absolute left-3 top-3 bottom-3 w-[384px] max-w-[calc(100vw-24px)] z-[1100] flex flex-col gap-2 min-h-0 no-print">
        <SearchBar
          onSelect={selectPlace} onSave={saveFromSearch}
          placeTitle={selectedPlace ? placeDetails(selectedPlace).title : undefined}
          onClear={clearSelectedPlace}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {selectedPlace ? (
            <MapsPlacePanel
              place={selectedPlace}
              onClose={clearSelectedPlace}
              onRouteTo={routeToPlace}
              onSave={saveFromSearch}
              onNearby={(lat, lng) => exploreNearby(lat, lng)}
            />
          ) : activeCat ? (
            <PoiResultsPanel
              title={activeCat === 'nearby'
                ? t('maps_nearby', { defaultValue: 'À proximité' })
                : t(POI_CHIPS.find(c => c.key === activeCat)?.labelKey || '', { defaultValue: POI_CHIPS.find(c => c.key === activeCat)?.fallback || '' })}
              emoji={activeCat === 'nearby' ? '📍' : (POI_CHIPS.find(c => c.key === activeCat)?.emoji || '📍')}
              pois={pois}
              center={poiCenter}
              loading={poiLoading}
              error={poiError}
              onSelect={selectPoi}
              onClose={() => { setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null) }}
            />
          ) : tab !== 'search' ? (
            <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col h-full min-h-0">
              <div className="overflow-y-auto p-3 flex-1 min-h-0">
                {tab === 'places' && (
                  <MapsPlacesPanel
                    places={places} collections={collections} history={history}
                    onFly={(lat, lng) => flyTo(lat, lng)}
                    onDelete={deletePlace}
                    onUpdate={updatePlace}
                    onCreateCollection={createCollection}
                    onDeleteCollection={deleteCollection}
                    onExport={exportPlaces}
                    onImport={importPlaces}
                    onClearHistory={clearHistory}
                  />
                )}
                {tab === 'gpx'    && <GpxPanel traces={traces} onShow={showGpx} onDelete={deleteGpx} onUpload={uploadGpx}
                  recording={recording} recStats={recStats} onStartRec={startRecording} onStopRec={stopRecording} />}
                {tab === 'route'  && (
                  <RoutePanel
                    waypoints={waypoints}
                    mode={routeMode} setMode={setRouteMode}
                    results={routeResults} selected={selectedRoute} setSelected={setSelectedRoute}
                    loading={routeLoading} error={routeError}
                    onSetWaypoint={setWaypointAt}
                    onClearWaypoint={clearWaypointAt}
                    onPickOnMap={(i) => setRoutePickMode(i)}
                    onAddStop={addStop}
                    onRemoveStop={removeStop}
                    onMoveStop={moveStop}
                    onClearAll={clearRoute}
                    onStartNav={() => nav.start(false)}
                    onSimulateNav={() => nav.start(true)}
                  />
                )}
                {tab === 'sketch' && <MapsSketchPanel s={sketch} />}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── HeaderActions flottant (plein écran) : rectangle arrondi sur la carte ── */}
      <div className="absolute top-3 right-3 z-[1110] bg-surface-0 rounded-2xl shadow-md border border-border px-1 flex items-center no-print">
        <HeaderActions compact />
      </div>

      {/* ── Chips de catégories (haut) — masquées sur mobile (place réduite) ── */}
      <div className="absolute top-4 left-[400px] right-[252px] z-[1090] hidden sm:flex flex-col items-start gap-2 no-print">
        <div className="flex gap-2 overflow-x-auto max-w-full" style={{ scrollbarWidth: 'none' }}>
          {POI_CHIPS.map(c => {
            const active = activeCat === c.key
            return (
              <button key={c.key} onClick={() => searchCategory(c)}
                className={`flex items-center gap-1.5 h-9 px-3.5 rounded-full border shadow-sm text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors
                  ${active ? 'bg-primary border-primary text-white hover:bg-primary-hover'
                           : 'bg-surface-0 border-border text-text-primary hover:bg-surface-1'}`}>
                <span aria-hidden>{c.emoji}</span>
                {t(c.labelKey, { defaultValue: c.fallback })}
                {active && poiLoading && <RefreshCw size={12} className="animate-spin" />}
                {active && !poiLoading && <X size={13} className="opacity-80" />}
              </button>
            )
          })}
        </div>
        {/* Compteur / état de l'exploration */}
        {activeCat && !poiLoading && (
          <div className="flex items-center gap-2 px-3 h-7 rounded-full bg-surface-0 border border-border shadow-sm text-xs text-text-secondary">
            {poiError
              ? <span className="text-text-tertiary">{poiError}</span>
              : <span>{t('maps_poi_count', { count: pois.length, defaultValue: `${pois.length} lieu(x)` })}</span>}
          </div>
        )}
      </div>

      {/* Bandeau de sélection d'un point d'itinéraire sur la carte */}
      {routePickMode !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-primary rounded-lg px-4 py-2 shadow-lg flex items-center gap-3 text-sm">
          <ChevronRight size={16} className="text-primary" />
          <span>{t('maps_pick_point', { point: String.fromCharCode(65 + routePickMode), defaultValue: `Cliquez pour placer le point ${String.fromCharCode(65 + routePickMode)}` })}</span>
          <button onClick={() => setRoutePickMode(null)} className="text-text-tertiary hover:text-text-primary"><X size={15} /></button>
        </div>
      )}

      {/* ── Contrôles bas-droite : cosmos + aide + localisation + zoom ── */}
      <div className="absolute bottom-6 right-4 z-[1100] flex flex-col items-end gap-3 no-print">
        <button onClick={openCosmos}
          title={t('maps_cosmos', { defaultValue: 'Système solaire' })}
          aria-label={t('maps_cosmos', { defaultValue: 'Système solaire' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <Orbit size={18} />
        </button>
        <button onClick={() => setShowShortcuts(true)} title={t('maps_shortcuts', { defaultValue: 'Raccourcis clavier (?)' })}
          aria-label={t('maps_shortcuts', { defaultValue: 'Raccourcis clavier' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <HelpCircle size={18} />
        </button>
        <button onClick={locate} title={t('maps_locate', { defaultValue: 'Ma position' })}
          aria-label={t('maps_locate', { defaultValue: 'Ma position' })}
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
              transit={transit}       onToggleTransit={toggleTransit}
              precip={precip}         onTogglePrecip={togglePrecip}
              terrain3d={terrain3d}   onToggleTerrain3d={toggleTerrain3d}
              imports={imports}       onImport={importFile} onRemoveImport={removeImport}
              online={online}         cachedTiles={cachedTiles} dlProgress={dlProgress}
              onDownloadArea={downloadVisibleArea} onClearTiles={clearTiles}
              highContrast={highContrast} onToggleContrast={() => setHighContrast(c => !c)}
              onClose={() => setLayersOpen(false)}
            />
          </div>
        )}
        <button title={t('maps_layers')} onClick={() => setLayersOpen(o => !o)}
          className={`flex items-center gap-2 h-10 px-3 rounded-lg border shadow-md text-xs font-medium transition-colors
            ${layersOpen ? 'bg-primary-light border-primary text-primary' : 'bg-surface-0 border-border text-text-secondary hover:bg-surface-1'}`}>
          <Layers size={16} /> {t('maps_layers')}
        </button>
      </div>

      {/* Bandeau hors-ligne */}
      {!online && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1180] flex items-center gap-1.5 bg-amber-500 text-white rounded-full px-3 py-1 text-xs font-medium shadow-lg no-print">
          <WifiOff size={13} /> {t('maps_offline_banner', { defaultValue: 'Hors-ligne — tuiles en cache uniquement' })}
        </div>
      )}

      {/* Aide : raccourcis clavier */}
      {showShortcuts && (
        <div className="absolute inset-0 z-[1300] flex items-center justify-center bg-black/30 no-print" onClick={() => setShowShortcuts(false)}>
          <div className="bg-surface-0 rounded-2xl shadow-2xl border border-border w-[360px] max-w-[calc(100vw-24px)] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5"><Keyboard size={15} /> {t('maps_shortcuts', { defaultValue: 'Raccourcis clavier' })}</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-text-tertiary hover:text-text-primary"><X size={17} /></button>
            </div>
            <div className="p-4 flex flex-col gap-1.5 text-xs">
              {[
                ['S', t('maps_tab_search', { defaultValue: 'Recherche' })],
                ['P', t('maps_tab_places', { defaultValue: 'Lieux' })],
                ['R', t('maps_tab_route', { defaultValue: 'Itinéraire' })],
                ['G', 'GPX'],
                ['D', t('maps_tab_sketch', { defaultValue: 'Croquis' })],
                ['L', t('maps_layers', { defaultValue: 'Couches' })],
                ['+ / −', t('maps_zoom_in', { defaultValue: 'Zoom' })],
                ['Échap', t('common_close', { defaultValue: 'Fermer' })],
                ['?', t('maps_shortcuts', { defaultValue: 'Cette aide' })],
              ].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-text-secondary">{label}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[11px] font-mono text-text-primary">{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vue « système solaire » 3D (cosmos) */}
      {cosmosOpen && (
        <MapsCosmos3D currentId={worldId} onTravel={travelTo} onClose={closeCosmos} />
      )}

      {/* Transition cinématique (fondu spatial) entre deux mondes */}
      <div className={`absolute inset-0 z-[1280] maps-space transition-opacity duration-500 no-print ${warping ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />


      {/* Badge du monde courant (hors Terre) + retour */}
      {worldId !== 'earth' && !cosmosOpen && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1115] flex items-center gap-2 bg-surface-0 rounded-full shadow-md border border-border px-3 py-1 text-xs no-print">
          <span className="font-medium text-text-primary">{worldById(worldId)?.name ?? worldId}</span>
          <button onClick={() => { const e = worldById('earth'); if (e) travelTo(e) }} className="text-primary hover:underline">
            {t('maps_back_earth', { defaultValue: '← Terre' })}
          </button>
        </div>
      )}

      {/* Navigation temps réel (guidage) */}
      {nav.active && nav.state && (
        <MapsNavOverlay state={nav.state} simulating={nav.simulating} onStop={nav.stop} />
      )}

      {/* Profil d'élévation de la trace GPX affichée (bas-centre) */}
      {trackData && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1105] no-print">
          <MapsElevationChart
            name={trackData.name}
            data={trackData.data}
            onClose={() => setTrackData(null)}
            onExport={exportTrackGeoJSON}
          />
        </div>
      )}

      {/* Téléversement GPX en cours */}
      {uploading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-border rounded-full px-3 py-1.5 shadow-md flex items-center gap-2 text-xs text-text-secondary">
          <RefreshCw size={12} className="animate-spin" /> {t('maps_uploading')}
        </div>
      )}

      {/* Menu contextuel */}
      {ctxMenu && (
        <MenuDropdown
          pos={{ top: ctxMenu.y, left: ctxMenu.x, minWidth: 230 }}
          onClose={() => setCtxMenu(null)}
          items={[
            { type: 'label', text: `${ctxMenu.lat.toFixed(5)}, ${ctxMenu.lng.toFixed(5)}` },
            { type: 'action', icon: <Info size={13} />, label: t('maps_whats_here', { defaultValue: "Qu'y a-t-il ici ?" }), onClick: () => whatIsHere(ctxMenu.lat, ctxMenu.lng) },
            { type: 'action', icon: <Star size={13} />, label: t('maps_save_place'), onClick: () => { saveFromContextMenu(ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
            { type: 'separator' },
            {
              type: 'submenu',
              icon: <Navigation size={13} />,
              label: t('maps_tab_route', { defaultValue: 'Itinéraire' }),
              items: [
                { type: 'action', icon: <Navigation size={13} />, label: t('maps_route_from_here', { defaultValue: "Partir d'ici" }),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n[0] = { lat: ctxMenu.lat, lng: ctxMenu.lng }; return n }); setTab('route'); setCtxMenu(null) } },
                { type: 'action', icon: <Flag size={13} />, label: t('maps_route_to_here'),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n[n.length - 1] = { lat: ctxMenu.lat, lng: ctxMenu.lng }; return n }); setTab('route'); setCtxMenu(null) } },
                { type: 'action', icon: <Plus size={13} />, label: t('maps_route_add_stop_here', { defaultValue: 'Ajouter comme étape' }),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n.splice(Math.max(1, n.length - 1), 0, { lat: ctxMenu.lat, lng: ctxMenu.lng }); return n }); setTab('route'); setCtxMenu(null) } },
              ],
            },
            {
              type: 'submenu',
              icon: <Search size={13} />,
              label: t('maps_explore_around', { defaultValue: 'Explorer autour' }),
              items: POI_CHIPS.map(c => ({
                type: 'action' as const,
                label: `${c.emoji}  ${t(c.labelKey, { defaultValue: c.fallback })}`,
                onClick: () => { searchCategory(c, { lat: ctxMenu.lat, lng: ctxMenu.lng }); setCtxMenu(null) },
              })),
            },
            {
              type: 'submenu',
              icon: <Ruler size={13} />,
              label: t('maps_measure_draw', { defaultValue: 'Mesurer / Dessiner' }),
              items: [
                { type: 'action', icon: <Ruler size={13} />, label: t('maps_tool_measure_dist', { defaultValue: 'Mesurer une distance' }),
                  onClick: () => { setTab('sketch'); sketch.setTool('measure-line'); setCtxMenu(null) } },
                { type: 'action', icon: <Shapes size={13} />, label: t('maps_tool_measure_area', { defaultValue: 'Mesurer une surface' }),
                  onClick: () => { setTab('sketch'); sketch.setTool('measure-area'); setCtxMenu(null) } },
                { type: 'action', icon: <MapPin size={13} />, label: t('maps_drop_pin_here', { defaultValue: 'Déposer une épingle ici' }),
                  onClick: () => { setTab('sketch'); sketch.addFeatureAt('pin', ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
                { type: 'action', icon: <TypeIcon size={13} />, label: t('maps_add_text_here', { defaultValue: 'Ajouter du texte ici' }),
                  onClick: () => { setTab('sketch'); sketch.addFeatureAt('text', ctxMenu.lat, ctxMenu.lng, 'Texte'); setCtxMenu(null) } },
              ],
            },
            { type: 'separator' },
            { type: 'action', icon: <Copy size={13} />, label: t('maps_copy_coords', { defaultValue: 'Copier les coordonnées' }), onClick: () => copyCoords(ctxMenu.lat, ctxMenu.lng) },
            // Cross-module copy: JSON envelopes pasteable into chat, documents…
            { type: 'action', icon: <MapPin size={13} />, label: t('maps_copy_place', { defaultValue: 'Copier le lieu' }),
              onClick: () => { copyKubunoData(pointEnvelope(ctxMenu.lat, ctxMenu.lng, ctxMenu.name)); setCtxMenu(null) } },
            // Cross-module labels (core-managed, browsable at /labels).
            { type: 'action', icon: <Star size={13} />, label: t('maps_kubuno_labels', { defaultValue: 'Étiquettes Kubuno…' }),
              onClick: () => { openLabelPicker(pointEnvelope(ctxMenu.lat, ctxMenu.lng, ctxMenu.name)); setCtxMenu(null) } },
            ...(routeResults[selectedRoute] ? [{
              type: 'action' as const, icon: <Route size={13} />, label: t('maps_copy_route', { defaultValue: "Copier l'itinéraire" }),
              onClick: () => {
                const wps = waypoints.filter((w): w is Waypoint => w != null)
                copyKubunoData(routeEnvelope(routeResults[selectedRoute], wps, routeMode))
                setCtxMenu(null)
              },
            }] : []),
            { type: 'action', icon: <Layers size={13} />, label: t('maps_copy_view', { defaultValue: 'Copier la vue actuelle' }),
              onClick: () => {
                const m = mapRef.current
                if (m) { const c = m.getCenter(); copyKubunoData(viewEnvelope(c.lat, c.lng, m.getZoom())) }
                setCtxMenu(null)
              } },
            { type: 'action', icon: <Compass size={13} />, label: t('maps_center_here', { defaultValue: 'Centrer ici' }), onClick: () => { flyTo(ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
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
