/**
 * Code-behind of `MapsRouteResults.kbview` (converted from `MapsRouteResults.tsx`).
 *
 * Result cards (one per alternative, or one per mode in "recommended"), the navigation buttons and the
 * collapsible turn-by-turn list.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsRouteResults.kbview'
import * as __parts from './MapsRouteResults.parts.tsx'
import { fmtDistanceIn, fmtDurationShort, type RouteResult, type DistanceUnits } from '../services/routing'
import { CRUISE_SPEED_KMH } from '../services/greatCircle'
import { useModeLabel } from './MapsRouteModes'
import { scheduleDate, type Schedule } from './MapsRouteOptions'
import type { RouteMode, OsrmMode } from '../maps-app/useRouteModes'

const fmtClock = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)

export interface MapsRouteResultsProps {
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
}

export class MapsRouteResults extends ViewBase {
  tr!: MapsRouteResultsStores['t']
  label!: (m: RouteMode) => string

  useStores() {
    const { t } = useTranslation('maps')
    const label = useModeLabel()
    return { t, label }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, label: s.label })
  }

  private get plane() { return this.props.mode === 'plane' }
  private get sel(): RouteResult | undefined { return this.props.results[this.props.selected] }

  get calculating_label() { return this.tr('maps_calculating', { defaultValue: 'Calcul…' }) }
  get start_label() { return this.tr('maps_nav_start', { defaultValue: 'Démarrer' }) }
  get sim_label() { return this.tr('maps_nav_sim', { defaultValue: 'Simulation' }) }
  get simulate_tip() { return this.tr('maps_nav_simulate', { defaultValue: 'Simuler le trajet' }) }
  get details_label() { return this.tr('maps_route_details', { defaultValue: 'Détails' }) }
  get details_closed() { return !this.props.detailsOpen }

  get show_error() { return !this.props.loading && !!this.props.error }
  get show_results() { return !this.props.loading && !this.props.error && this.props.results.length > 0 }
  get show_nav() { return !this.plane && !!this.sel }
  get has_steps() { return !!this.sel && this.sel.steps.length > 0 }
  get show_steps() { return !this.plane && !!this.sel && this.has_steps && this.props.detailsOpen }

  get steps_label() {
    return `${this.tr('maps_route_steps', { defaultValue: 'Feuille de route' })} · ${this.sel?.steps.length ?? 0}`
  }

  private timeHint(r: RouteResult): string {
    const anchor = scheduleDate(this.props.schedule)
    if (!anchor) return ''
    return this.props.schedule.kind === 'arrive'
      ? this.tr('maps_route_leave_around', { defaultValue: 'Départ vers {{time}}', time: fmtClock(new Date(anchor.getTime() - r.duration * 1000)) })
      : this.tr('maps_route_arrive_around', { defaultValue: 'Arrivée vers {{time}}', time: fmtClock(new Date(anchor.getTime() + r.duration * 1000)) })
  }

  get rows_cards() {
    return this.memo('rows_cards', [this.props.results, this.props.resultModes, this.props.selected, this.props.mode, this.props.units, this.props.schedule, this.label, this.tr], () => {
      const plane = this.plane
      return this.props.results.map((r, i) => {
        const active = i === this.props.selected
        const cardMode: RouteMode = this.props.resultModes?.[i] ?? this.props.mode
        const title = plane
          ? this.tr('maps_route_plane_distance', { defaultValue: "{{distance}} à vol d'oiseau", distance: fmtDistanceIn(r.distance, this.props.units) })
          : fmtDurationShort(r.duration)
        const base = plane
          ? this.tr('maps_route_plane_estimate', { defaultValue: '≈ {{duration}} · estimation à {{speed}} km/h', duration: fmtDurationShort(r.duration), speed: CRUISE_SPEED_KMH })
          : this.props.resultModes
            ? this.label(cardMode)
            : i === 0 ? this.tr('maps_route_best', { defaultValue: 'Meilleur itinéraire' }) : this.tr('maps_route_alt', { defaultValue: 'Variante' })
        const hint = plane ? '' : this.timeHint(r)
        return {
          key: String(i),
          index: i,
          active,
          CardModeIcon: __parts.CardModeIcon,
          icon_props: { mode: cardMode },
          icon_class: `flex-shrink-0 ${active ? 'text-primary' : 'text-text-secondary'}`,
          title,
          title_class: `text-sm font-semibold truncate ${active ? 'text-primary' : 'text-text-primary'}`,
          subtitle: hint ? `${base} · ${hint}` : base,
          show_dist: !plane,
          dist: fmtDistanceIn(r.distance, this.props.units),
          card_class: `flex items-center gap-4 px-6 py-4 cursor-pointer outline-none border-l-4 ${active ? 'border-primary bg-primary-light/40' : 'border-transparent hover:bg-surface-1'}`,
        }
      })
    })
  }

  get rows_steps() {
    return this.memo('rows_steps', [this.sel, this.props.units], () => {
      const sel = this.sel
      if (!sel) return []
      return sel.steps.map((s, i) => ({
        key: String(i),
        StepIcon: __parts.StepIcon,
        icon_props: { iconKey: s.iconKey },
        text: s.text,
        show_dist: s.distance > 0,
        dist: fmtDistanceIn(s.distance, this.props.units),
      }))
    })
  }

  select(_sender: unknown, args: MouseEventArgs) {
    const { index } = (args as MouseEventArgs & { row: { index: number } }).row
    this.props.setSelected(index)
  }

  start_nav(_s: unknown, _a: MouseEventArgs) { this.props.onStartNav() }
  simulate_nav(_s: unknown, _a: MouseEventArgs) { this.props.onSimulateNav() }
  toggle_details(_s: unknown, _a: MouseEventArgs) { this.props.setDetailsOpen(!this.props.detailsOpen) }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRouteResultsStores = ReturnType<MapsRouteResults['useStores']>

export default MapsRouteResults.component()
