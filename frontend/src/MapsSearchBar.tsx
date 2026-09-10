import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, RefreshCw } from 'lucide-react'
import type maplibregl from 'maplibre-gl'
import { api } from '@kubuno/sdk'
import { Tooltip } from '@ui'
import { buildNominatimSearchUrl, type SearchResult } from './geocoding'
import type { HistoryEntry } from './MapsPlacesPanel'
import { useSavedPlaces, savedPlaceToResult, type SavedPlaceKind } from './useSavedPlaces'
import { MapsSearchDropdown, hoverBg, BUTTON_HOVER, type SearchRow } from './MapsSearchDropdown'
import { idleRows, typingRows, fetchResults, searchNearbyFirst, mapViewbox, historyToResult, SUGGESTIONS_MAX } from './searchRows'
import { DirectionsIcon } from './DirectionsIcon'
import { MapsLocalCard, OVERLAY_SHADOW, useMapCenter } from './MapsLocalCard'

/**
 * Top search pill of the map with its dropdown (saved shortcuts, recent
 * searches, live suggestions) and the "around here" card underneath.
 */
export function MapsSearchBar({
  mapRef, mapReady, history, placeTitle,
  onSelect, onSave, onClear, onDirections, onOpenHistory, onHistoryChanged,
}: {
  mapRef:      RefObject<maplibregl.Map | null>
  mapReady:    boolean
  history:     HistoryEntry[]
  /** Name of the currently selected place (shown in the pill), if any. */
  placeTitle?: string
  onSelect:    (r: SearchResult) => void
  onSave?:     (r: SearchResult) => void
  onClear:     () => void
  /** Directions button (no place selected): opens the route tab. */
  onDirections: () => void
  /** "More recent addresses": opens the sidebar tab listing the full history. */
  onOpenHistory: () => void
  /** Called after a selection was recorded in the server-side history. */
  onHistoryChanged?: () => void
}) {
  const { t } = useTranslation('maps')
  const rootRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q,       setQ]       = useState('')
  const [typed,   setTyped]   = useState(false)   // the user edited the text since the last sync
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [open,    setOpen]    = useState(false)
  const [active,  setActive]  = useState(-1)
  const [editing, setEditing] = useState<SavedPlaceKind | null>(null)
  const [busyRow, setBusyRow] = useState<string | null>(null)   // history id being geocoded
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq   = useRef(0)                          // drops out-of-order responses
  const saved  = useSavedPlaces()
  const center = useMapCenter(mapRef, mapReady)

  // Mirror the selected place in the pill (and drop stale suggestions).
  useEffect(() => { setQ(placeTitle ?? ''); setTyped(false); setResults([]); setError(null) }, [placeTitle])

  const search = useCallback(async (query: string) => {
    const id = ++seq.current
    if (query.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const found = await searchNearbyFirst(query, mapRef.current, SUGGESTIONS_MAX)
      if (id !== seq.current) return
      setResults(found); setOpen(true)
    } catch {
      if (id !== seq.current) return
      setError(t('maps_geocoding_unavailable', { defaultValue: 'Service de géocodage indisponible' })); setResults([])
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [t, mapRef])

  const onChange = (val: string) => {
    setQ(val); setTyped(true); setOpen(true); setEditing(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  const close = useCallback(() => { setOpen(false); setActive(-1); setEditing(null) }, [])

  const clear = () => {
    setQ(''); setTyped(false); setResults([]); setError(null)
    onClear()
    inputRef.current?.focus()
  }

  // Click outside the pill / dropdown / local card closes everything.
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])

  const typing = typed && q.trim().length >= 2
  const rows = useMemo<SearchRow[]>(() => typing
    ? typingRows(q, history, results)
    : idleRows({
        work: { kind: 'saved', which: 'work', place: saved.work },
        home: { kind: 'saved', which: 'home', place: saved.home },
      }, history),
  [typing, q, history, results, saved.home, saved.work])
  useEffect(() => { setActive(-1) }, [rows])

  /** Best-effort: the backend records a history entry when it geocodes a query. */
  const recordHistory = (r: SearchResult) => {
    api.get(`/maps/geocode/search?q=${encodeURIComponent(r.display_name)}&limit=1`)
      .then(() => onHistoryChanged?.())
      .catch(() => {/* history is a convenience, never block the selection */})
  }

  /** History entry without coordinates: geocode its text, then select like a suggestion. */
  const geocodeHistory = async (entry: HistoryEntry) => {
    if (busyRow) return
    setBusyRow(entry.id); setError(null)
    try {
      const found = await fetchResults(buildNominatimSearchUrl(entry.query, 1, mapViewbox(mapRef.current), false))
      if (found.length === 0) {
        setError(t('maps_search_no_result', { defaultValue: 'Aucun résultat pour cette recherche' }))
        return
      }
      onSelect(found[0]); recordHistory(found[0])
      close(); inputRef.current?.blur()
    } catch {
      setError(t('maps_geocoding_unavailable', { defaultValue: 'Service de géocodage indisponible' }))
    } finally {
      setBusyRow(null)
    }
  }

  const activate = (row: SearchRow) => {
    switch (row.kind) {
      case 'saved':
        if (!row.place) { setEditing(row.which); return }
        onSelect(savedPlaceToResult(row.which, row.place, row.which === 'home'
          ? t('maps_saved_home', { defaultValue: 'Domicile' })
          : t('maps_saved_work', { defaultValue: 'Travail' })))
        break
      case 'history':
        if (row.entry.result_lat != null && row.entry.result_lng != null) onSelect(historyToResult(row.entry))
        else { geocodeHistory(row.entry); return }   // async: closes on success
        break
      case 'more':
        onOpenHistory()
        break
      case 'suggestion':
        onSelect(row.result)
        recordHistory(row.result)
        break
    }
    close()
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); setActive(a => rows.length ? (a + 1) % rows.length : -1); break
      case 'ArrowUp':
        e.preventDefault(); setActive(a => rows.length ? (a <= 0 ? rows.length - 1 : a - 1) : -1); break
      case 'Enter': {
        const row = rows[active] ?? (typing ? rows[0] : undefined)
        if (row) { e.preventDefault(); activate(row) }
        else if (typing) { if (timer.current) clearTimeout(timer.current); search(q) }
        break
      }
      case 'Escape':
        e.preventDefault(); close(); inputRef.current?.blur(); break
    }
  }

  const submitNow = () => {
    inputRef.current?.focus(); setOpen(true)
    if (q.trim().length >= 2 && !placeTitle) { setTyped(true); if (timer.current) clearTimeout(timer.current); search(q) }
  }

  const showClear = q.length > 0 || !!placeTitle
  const iconBtn = 'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-transparent'

  return (
    <div ref={rootRef} className="relative h-12 flex-shrink-0">
      {/* Absolute so the open list overlays the panel below without pushing it.
          Pill and list are ONE white card (single shadow); the local card is a
          separate card 8 px underneath. */}
      <div className="absolute inset-x-0 top-0 z-30 flex flex-col gap-2">
        <div className={`bg-surface-0 ${open ? 'rounded-3xl' : 'rounded-full'}`} style={{ boxShadow: OVERLAY_SHADOW }}>
          <div className="flex items-center h-12 pl-5 pr-1.5">
            <input
              ref={inputRef}
              value={q}
              onChange={e => onChange(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={t('maps_search_in_maps', { defaultValue: 'Rechercher dans Maps' })}
              aria-label={t('maps_search_in_maps', { defaultValue: 'Rechercher dans Maps' })}
              aria-expanded={open}
              className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
            />
            {loading && <RefreshCw size={16} className="text-text-tertiary animate-spin flex-shrink-0 mr-1" />}
            <button type="button" onClick={submitNow} {...hoverBg(BUTTON_HOVER)}
              title={t('maps_search_action', { defaultValue: 'Rechercher' })}
              className={`${iconBtn} text-text-secondary`}>
              <Search size={20} />
            </button>
            {showClear ? (
              <button type="button" onClick={clear} {...hoverBg(BUTTON_HOVER)}
                title={t('maps_search_clear', { defaultValue: 'Effacer' })}
                className={`${iconBtn} text-text-secondary`}>
                <X size={20} />
              </button>
            ) : (
              <Tooltip label={t('maps_search_directions', { defaultValue: 'Itinéraire' })}>
                <button type="button" onClick={onDirections} {...hoverBg(BUTTON_HOVER)}
                  aria-label={t('maps_search_directions', { defaultValue: 'Itinéraire' })}
                  className={`${iconBtn} text-primary`}>
                  <DirectionsIcon size={22} />
                </button>
              </Tooltip>
            )}
          </div>
          {open && (rows.length > 0 || error || editing) && (
            <MapsSearchDropdown
              rows={rows} active={active} query={typing ? q : ''} error={error} editing={editing} busyRow={busyRow}
              onHover={setActive} onActivate={activate} onEdit={setEditing}
              onSaveSaved={(which, place) => { saved.setSaved(which, place).catch(() => {}) }}
              onSave={onSave}
            />
          )}
        </div>
        {open && <MapsLocalCard center={center} visible={open} />}
      </div>
    </div>
  )
}
