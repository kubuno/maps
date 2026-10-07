import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed, Home, Briefcase, Clock, RefreshCw, AlertCircle } from 'lucide-react'
import { buildNominatimSearchUrl } from './geocoding'
import type { HistoryEntry } from './MapsPlacesPanel'
import { fold, historyTitle, ROW_HOVER } from './MapsSearchDropdown'
import { fetchResults } from './searchRows'
import { useSavedPlaces, savedPlaceSubtitle } from './useSavedPlaces'

/** Rows shown at most under the fields (your position + shortcuts + recents). */
export const SUGGESTION_ROWS_MAX = 10

function Row({ icon, title, subtitle, busy, onClick }: {
  icon: ReactNode; title: string; subtitle?: string | null; busy?: boolean; onClick: () => void
}) {
  return (
    <div role="button" tabIndex={0}
      onMouseDown={e => e.preventDefault()}   // keep the focus in the route field
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = ROW_HOVER }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}
      className="flex items-center gap-4 h-16 pl-6 pr-4 cursor-pointer outline-none">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        {subtitle && <p className="text-sm text-text-secondary truncate">{subtitle}</p>}
      </div>
      {busy && <RefreshCw size={18} className="text-text-tertiary animate-spin flex-shrink-0" />}
    </div>
  )
}

function Circle({ tinted, children }: { tinted?: boolean; children: ReactNode }) {
  return (
    <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
      tinted ? 'bg-primary-light text-primary' : 'bg-surface-2 text-text-primary'}`}>
      {children}
    </span>
  )
}

/**
 * Suggestions under the route fields while one of them is empty or focused:
 * the device position, the saved Home / Work shortcuts, then recent searches.
 * Picking a row fills the target field.
 */
export function MapsRouteSuggestions({ history, onPick }: {
  history: HistoryEntry[]
  onPick:  (lat: number, lng: number, label: string) => void
}) {
  const { t } = useTranslation('maps')
  const { home, work } = useSavedPlaces()
  const [busy,  setBusy]  = useState<string | null>(null)   // 'me' or a history id
  const [error, setError] = useState<string | null>(null)

  const yourPosition = t('maps_route_your_location', { defaultValue: 'Votre position' })

  const locate = () => {
    if (busy) return
    if (!navigator.geolocation) {
      setError(t('maps_route_location_unavailable', { defaultValue: 'Position indisponible' })); return
    }
    setBusy('me'); setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => { setBusy(null); onPick(pos.coords.latitude, pos.coords.longitude, yourPosition) },
      () => { setBusy(null); setError(t('maps_route_location_unavailable', { defaultValue: 'Position indisponible' })) },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  /** A recent entry without coordinates: geocode its text first. */
  const pickHistory = async (e: HistoryEntry) => {
    if (busy) return
    if (e.result_lat != null && e.result_lng != null) { onPick(e.result_lat, e.result_lng, historyTitle(e)); return }
    setBusy(e.id); setError(null)
    try {
      const found = await fetchResults(buildNominatimSearchUrl(e.query, 1))
      if (!found.length) { setError(t('maps_search_no_result', { defaultValue: 'Aucun résultat pour cette recherche' })); return }
      onPick(parseFloat(found[0].lat), parseFloat(found[0].lon), historyTitle(e))
    } catch {
      setError(t('maps_geocoding_unavailable', { defaultValue: 'Service de géocodage indisponible' }))
    } finally { setBusy(null) }
  }

  // Recents deduplicated by title, capped so the whole list stays ≤ 10 rows.
  const shortcuts = (home ? 1 : 0) + (work ? 1 : 0)
  const recents: HistoryEntry[] = []
  const seen = new Set<string>()
  for (const e of history) {
    const key = fold(historyTitle(e))
    if (seen.has(key)) continue
    seen.add(key); recents.push(e)
    if (recents.length >= SUGGESTION_ROWS_MAX - 1 - shortcuts) break
  }
  const subtitleOf = (e: HistoryEntry) => {
    const rest = (e.result_name ?? '').split(',').slice(1).map(s => s.trim()).filter(Boolean)
    return rest.length ? rest.join(', ') : null
  }

  return (
    <div className="py-1">
      {error && (
        <p className="px-6 py-2 text-sm text-danger flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>
      )}
      <Row icon={<Circle tinted><LocateFixed size={20} /></Circle>} title={yourPosition} busy={busy === 'me'} onClick={locate} />
      {home && (
        <Row icon={<Circle tinted><Home size={20} /></Circle>}
          title={t('maps_saved_home', { defaultValue: 'Domicile' })} subtitle={savedPlaceSubtitle(home)}
          onClick={() => onPick(home.lat, home.lng, t('maps_saved_home', { defaultValue: 'Domicile' }))} />
      )}
      {work && (
        <Row icon={<Circle tinted><Briefcase size={20} /></Circle>}
          title={t('maps_saved_work', { defaultValue: 'Travail' })} subtitle={savedPlaceSubtitle(work)}
          onClick={() => onPick(work.lat, work.lng, t('maps_saved_work', { defaultValue: 'Travail' }))} />
      )}
      {recents.map(e => (
        <Row key={e.id} icon={<Circle><Clock size={20} /></Circle>}
          title={historyTitle(e)} subtitle={subtitleOf(e)} busy={busy === e.id}
          onClick={() => { void pickHistory(e) }} />
      ))}
    </div>
  )
}
