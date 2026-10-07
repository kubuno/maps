import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { MapsRouteModes } from './MapsRouteModes'
import { MapsRouteFields } from './MapsRouteFields'
import { MapsRouteSuggestions } from './MapsRouteSuggestions'
import { MapsRouteOptions, type Schedule } from './MapsRouteOptions'
import { MapsRouteResults } from './MapsRouteResults'
import { MapsRouteActions } from './MapsRouteActions'
import { useModulePrefs } from './userPrefs'
import { fmtDistanceIn, fmtDurationShort, type LatLng, type DistanceUnits } from './routing'
import type { HistoryEntry } from './MapsPlacesPanel'
import type { RouteModesState } from './useRouteModes'

type UnitsPrefs = { units: string }

/**
 * Route panel of the left rail, top to bottom: mode row, origin / stops /
 * destination fields, "leave now" + options, then either the suggestions
 * (a field is empty or focused) or the results with their actions.
 */
export function MapsRoutePanel({
  route, waypoints, history,
  onSetWaypoint, onClearWaypoint, onPickOnMap, onAddStop, onRemoveStop, onReorder, onSwap,
  onClearAll, onClose, onStartNav, onSimulateNav,
}: {
  route:     RouteModesState
  waypoints: (LatLng | null)[]
  history:   HistoryEntry[]
  onSetWaypoint:   (index: number, lat: number, lng: number, label?: string) => void
  onClearWaypoint: (index: number) => void
  onPickOnMap:     (index: number) => void
  onAddStop:       () => void
  onRemoveStop:    (index: number) => void
  onReorder:       (from: number, to: number) => void
  onSwap:          () => void
  onClearAll:      () => void
  onClose:         () => void
  onStartNav:      () => void
  onSimulateNav:   () => void
}) {
  const { t } = useTranslation('maps')
  const [focused,     setFocused]     = useState<number | null>(null)
  const [typing,      setTyping]      = useState(false)
  const [schedule,    setSchedule]    = useState<Schedule>({ kind: 'now' })
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Distance units follow the user's module preference (also edited in the settings page).
  const { prefs, update } = useModulePrefs<UnitsPrefs>('maps', { units: 'km' })
  const units: DistanceUnits = prefs.units === 'miles' ? 'miles' : 'km'
  const setUnits = (u: DistanceUnits) => { update({ units: u }).catch(() => {}) }

  // A field that just received a point unmounts its input without a blur event.
  useEffect(() => { if (focused !== null && waypoints[focused]) setFocused(null) }, [waypoints, focused])

  // Field the suggestions / map pick apply to: the focused empty one, else the first empty one.
  const target = focused !== null && !waypoints[focused] ? focused : waypoints.findIndex(w => !w)
  const showSuggestions = target >= 0 && !typing
  const hasAny = waypoints.some(Boolean)
  const sel = route.results[route.selected]
  const summary = sel
    ? route.mode === 'plane'
      ? t('maps_route_plane_distance', { defaultValue: "{{distance}} à vol d'oiseau", distance: fmtDistanceIn(sel.distance, units) })
      : `${fmtDurationShort(sel.duration)} · ${fmtDistanceIn(sel.distance, units)}`
    : ''

  const print = () => {
    setDetailsOpen(true)
    // Let the details expand before the print dialog snapshots the page.
    window.setTimeout(() => window.print(), 80)
  }

  return (
    <div className="flex flex-col">
      <MapsRouteModes mode={route.mode} setMode={route.setMode} onClose={onClose} />
      <MapsRouteFields
        waypoints={waypoints} target={target}
        onSetWaypoint={onSetWaypoint} onClearWaypoint={onClearWaypoint}
        onAddStop={onAddStop} onRemoveStop={onRemoveStop} onReorder={onReorder} onSwap={onSwap}
        onPickOnMap={onPickOnMap}
        onFocusChange={(i, f) => setFocused(cur => (f ? i : cur === i ? null : cur))}
        onTyping={setTyping}
      />
      {route.mode !== 'transit' && (
        <MapsRouteOptions
          avoid={route.avoid} setAvoid={route.setAvoid} excludeUnsupported={route.excludeUnsupported}
          showAvoid={route.mode !== 'plane'}
          units={units} setUnits={setUnits} schedule={schedule} setSchedule={setSchedule}
        />
      )}
      <div className="border-t border-border mt-3" />

      {showSuggestions ? (
        <MapsRouteSuggestions history={history} onPick={(lat, lng, label) => onSetWaypoint(target, lat, lng, label)} />
      ) : (
        <>
          {route.mode === 'transit' && (
            <p className="px-6 py-5 text-sm text-text-secondary">
              {t('maps_route_mode_transit_unavailable', { defaultValue: 'Transports en commun : pas encore disponible' })}
            </p>
          )}
          {sel && !route.loading && (
            <MapsRouteActions waypoints={waypoints} mode={route.effectiveMode} summary={summary} onPrint={print} />
          )}
          <MapsRouteResults
            mode={route.mode} results={route.results} resultModes={route.resultModes}
            selected={route.selected} setSelected={route.setSelected}
            loading={route.loading} error={route.error} units={units} schedule={schedule}
            detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen}
            onStartNav={onStartNav} onSimulateNav={onSimulateNav}
          />
        </>
      )}

      {hasAny && (
        <button type="button" onClick={onClearAll}
          className="self-start flex items-center gap-1.5 mx-4 my-3 text-sm text-text-secondary hover:text-danger transition-colors no-print">
          <X size={16} /> {t('maps_clear_route', { defaultValue: "Effacer l'itinéraire" })}
        </button>
      )}
    </div>
  )
}
