import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp, ArrowUpRight, ArrowRight, ArrowUpLeft, ArrowLeft, CornerUpRight, CornerUpLeft,
  RotateCcw, RotateCw, Flag, ChevronUp, ChevronDown, Navigation, Play, RefreshCw, AlertCircle,
} from 'lucide-react'
import { fmtDistanceIn, fmtDurationShort, type RouteResult, type DistanceUnits } from './routing'
import { CRUISE_SPEED_KMH } from './greatCircle'
import { modeIcon, useModeLabel } from './MapsRouteModes'
import { scheduleDate, type Schedule } from './MapsRouteOptions'
import { hoverBg, ROW_HOVER, BUTTON_HOVER } from './MapsSearchDropdown'
import type { RouteMode, OsrmMode } from './useRouteModes'

/** Maneuver key → lucide icon (turn-by-turn list). */
export function maneuverIcon(key: string, size = 18): ReactNode {
  switch (key) {
    case 'arrive':       return <Flag size={size} />
    case 'slight-right': return <ArrowUpRight size={size} />
    case 'right':        return <ArrowRight size={size} />
    case 'sharp-right':  return <CornerUpRight size={size} />
    case 'slight-left':  return <ArrowUpLeft size={size} />
    case 'left':         return <ArrowLeft size={size} />
    case 'sharp-left':   return <CornerUpLeft size={size} />
    case 'uturn':        return <RotateCcw size={size} />
    case 'roundabout':   return <RotateCw size={size} />
    case 'depart': case 'straight':
    default:             return <ArrowUp size={size} />
  }
}

const fmtClock = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)

/**
 * Result cards (one per alternative, or one per mode in "recommended"), the
 * navigation buttons and the collapsible turn-by-turn list.
 */
export function MapsRouteResults({
  mode, results, resultModes, selected, setSelected, loading, error, units, schedule,
  detailsOpen, setDetailsOpen, onStartNav, onSimulateNav,
}: {
  mode:        RouteMode
  results:     RouteResult[]
  resultModes: OsrmMode[] | null
  selected:    number
  setSelected: (i: number) => void
  loading:     boolean
  error:       string | null
  units:       DistanceUnits
  schedule:    Schedule
  detailsOpen: boolean
  setDetailsOpen: (open: boolean) => void
  onStartNav:    () => void
  onSimulateNav: () => void
}) {
  const { t } = useTranslation('maps')
  const label = useModeLabel()
  const sel = results[selected]
  const plane = mode === 'plane'
  const anchor = scheduleDate(schedule)

  /** "Arrive around HH:MM" (departure + duration) or "Leave around HH:MM" (arrival − duration). */
  const timeHint = (r: RouteResult): string | null => {
    if (!anchor) return null
    return schedule.kind === 'arrive'
      ? t('maps_route_leave_around',  { defaultValue: 'Départ vers {{time}}',  time: fmtClock(new Date(anchor.getTime() - r.duration * 1000)) })
      : t('maps_route_arrive_around', { defaultValue: 'Arrivée vers {{time}}', time: fmtClock(new Date(anchor.getTime() + r.duration * 1000)) })
  }

  // TODO(elevation): "Mostly flat" / "+120 m of climb" for bike and foot needs
  // an elevation source along the route. Kubuno only has elevation for GPX
  // tracks the user uploaded (server-side parsing) — nothing for OSRM
  // geometries — so no summary is shown rather than an invented one.

  if (loading) {
    return (
      <p className="px-6 py-5 text-sm text-text-secondary flex items-center gap-2">
        <RefreshCw size={16} className="animate-spin" /> {t('maps_calculating', { defaultValue: 'Calcul…' })}
      </p>
    )
  }
  if (error) {
    return <p className="px-6 py-5 text-sm text-danger flex items-center gap-2"><AlertCircle size={16} />{error}</p>
  }
  if (!results.length) return null

  return (
    <div className="flex flex-col">
      <div className="flex flex-col py-1" role="listbox">
        {results.map((r, i) => {
          const active = i === selected
          const cardMode: RouteMode = resultModes?.[i] ?? mode
          const title = plane
            ? t('maps_route_plane_distance', { defaultValue: "{{distance}} à vol d'oiseau", distance: fmtDistanceIn(r.distance, units) })
            : fmtDurationShort(r.duration)
          const subtitle = plane
            ? t('maps_route_plane_estimate', { defaultValue: '≈ {{duration}} · estimation à {{speed}} km/h', duration: fmtDurationShort(r.duration), speed: CRUISE_SPEED_KMH })
            : resultModes
              ? label(cardMode)
              : i === 0 ? t('maps_route_best', { defaultValue: 'Meilleur itinéraire' }) : t('maps_route_alt', { defaultValue: 'Variante' })
          const hint = plane ? null : timeHint(r)
          return (
            <div key={i} role="option" aria-selected={active} tabIndex={0}
              onClick={() => setSelected(i)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i) } }}
              {...(active ? {} : hoverBg(ROW_HOVER))}
              className={`flex items-center gap-4 px-6 py-4 cursor-pointer outline-none border-l-4 ${
                active ? 'border-primary bg-primary-light/40' : 'border-transparent'}`}>
              <span className={`flex-shrink-0 ${active ? 'text-primary' : 'text-text-secondary'}`}>{modeIcon(cardMode, 24)}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${active ? 'text-primary' : 'text-text-primary'}`}>{title}</p>
                <p className="text-sm text-text-secondary truncate">
                  {subtitle}{hint ? ` · ${hint}` : ''}
                </p>
              </div>
              {!plane && <span className="text-sm text-text-secondary flex-shrink-0">{fmtDistanceIn(r.distance, units)}</span>}
            </div>
          )
        })}
      </div>

      {!plane && sel && (
        <div className="flex items-center gap-2 px-4 pb-3 no-print">
          <button type="button" onClick={onStartNav}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
            <Navigation size={16} /> {t('maps_nav_start', { defaultValue: 'Démarrer' })}
          </button>
          <button type="button" onClick={onSimulateNav} title={t('maps_nav_simulate', { defaultValue: 'Simuler le trajet' })}
            {...hoverBg(BUTTON_HOVER)}
            className="flex items-center justify-center gap-2 h-10 px-4 rounded-full border border-border text-text-secondary text-sm font-medium">
            <Play size={15} /> {t('maps_nav_sim', { defaultValue: 'Simulation' })}
          </button>
          {sel.steps.length > 0 && (
            <button type="button" onClick={() => setDetailsOpen(!detailsOpen)} {...hoverBg(BUTTON_HOVER)}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1 h-10 px-3 rounded-full text-sm font-medium text-primary">
              {t('maps_route_details', { defaultValue: 'Détails' })} {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      )}

      {!plane && sel && sel.steps.length > 0 && detailsOpen && (
        <div className="border-t border-border">
          <p className="px-6 pt-3 pb-1 text-xs font-medium text-text-secondary uppercase tracking-wide">
            {t('maps_route_steps', { defaultValue: 'Feuille de route' })} · {sel.steps.length}
          </p>
          <div className="max-h-80 overflow-y-auto pb-2">
            {sel.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-2.5 border-t border-border first:border-t-0">
                <span className="text-text-secondary mt-0.5 flex-shrink-0">{maneuverIcon(s.iconKey)}</span>
                <p className="flex-1 min-w-0 text-sm text-text-primary leading-snug">{s.text}</p>
                {s.distance > 0 && <span className="text-sm text-text-tertiary flex-shrink-0 mt-0.5">{fmtDistanceIn(s.distance, units)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
