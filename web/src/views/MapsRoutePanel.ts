/**
 * Code-behind of `MapsRoutePanel.kbview` (converted from `MapsRoutePanel.tsx`).
 *
 * Route panel of the left rail, top to bottom: mode row, origin / stops / destination fields, "leave now" +
 * options, then either the suggestions (a field is empty or focused) or the results with their actions.
 */
import { bind, type MouseEventArgs, type EventArgs, type ValueChangedEventArgs } from '@kubuno/views'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsRoutePanel.kbview'
import { MapsRouteFields } from '../maps-app/MapsRouteFields'
import MapsRouteSuggestions from './MapsRouteSuggestions'
import MapsRouteOptions, { type Schedule } from './MapsRouteOptions'
import { useModulePrefs } from '../services/userPrefs'
import { fmtDistanceIn, fmtDurationShort, type LatLng, type DistanceUnits } from '../services/routing'
import type { HistoryEntry } from './MapsPlacesPanel'
import type { RouteModesState, RouteMode } from '../maps-app/useRouteModes'

type UnitsPrefs = { units: string }

export interface MapsRoutePanelProps {
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
}

export class MapsRoutePanel extends ViewBase {
  @bind accessor focused: number | null = null
  @bind accessor typing = false
  @bind accessor schedule: Schedule = { kind: 'now' }
  @bind accessor detailsOpen = false
  tr!: MapsRoutePanelStores['t']
  units: DistanceUnits = 'km'
  private update!: (patch: Partial<UnitsPrefs>) => Promise<void>

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  useHooks() {
    const { prefs, update } = useModulePrefs<UnitsPrefs>('maps', { units: 'km' })
    const units: DistanceUnits = prefs.units === 'miles' ? 'miles' : 'km'
    // A field that just received a point unmounts its input without a blur event.
    useEffect(() => {
      if (this.focused !== null && this.props.waypoints[this.focused]) this.focused = null
    }, [this.props.waypoints, this.focused])
    this.publish({ units, update })
    return { units }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
    this.useHooks()
  }

  private get route() { return this.props.route }
  get clear_label() { return this.tr('maps_clear_route', { defaultValue: "Effacer l'itinéraire" }) }
  get transit_note() { return this.tr('maps_route_mode_transit_unavailable', { defaultValue: 'Transports en commun : pas encore disponible' }) }

  /** Field the suggestions / map pick apply to: the focused empty one, else the first empty one. */
  get target() {
    return this.focused !== null && !this.props.waypoints[this.focused] ? this.focused : this.props.waypoints.findIndex(w => !w)
  }
  get show_suggestions() { return this.target >= 0 && !this.typing }
  get show_results() { return !this.show_suggestions }
  get show_options() { return this.route.mode !== 'transit' }
  get show_transit_note() { return !this.show_suggestions && this.route.mode === 'transit' }
  get has_any() { return this.props.waypoints.some(Boolean) }
  private get sel() { return this.route.results[this.route.selected] }
  get show_actions() { return !this.show_suggestions && !!this.sel && !this.route.loading }

  get summary() {
    const sel = this.sel
    if (!sel) return ''
    return this.route.mode === 'plane'
      ? this.tr('maps_route_plane_distance', { defaultValue: "{{distance}} à vol d'oiseau", distance: fmtDistanceIn(sel.distance, this.units) })
      : `${fmtDurationShort(sel.duration)} · ${fmtDistanceIn(sel.distance, this.units)}`
  }

  private print = () => {
    this.detailsOpen = true
    window.setTimeout(() => window.print(), 80)
  }
  private setUnits = (u: DistanceUnits) => { this.update({ units: u }).catch(() => {}) }

  get Fields() { return MapsRouteFields }
  get Options() { return MapsRouteOptions }
  get Suggestions() { return MapsRouteSuggestions }

  // --- MapsRouteModes (native element) ---
  modes_set_mode(_s: unknown, e: ValueChangedEventArgs) { this.route.setMode(e.value as RouteMode) }
  panel_close(_s: unknown, _e: EventArgs) { this.props.onClose() }

  get fields_props() {
    return this.memo('fields_props', [this.props.waypoints, this.target], () => ({
      waypoints: this.props.waypoints, target: this.target,
      onSetWaypoint: this.props.onSetWaypoint, onClearWaypoint: this.props.onClearWaypoint,
      onAddStop: this.props.onAddStop, onRemoveStop: this.props.onRemoveStop, onReorder: this.props.onReorder, onSwap: this.props.onSwap,
      onPickOnMap: this.props.onPickOnMap,
      onFocusChange: this.memo('onFocusChange:bound', [], () => (i: number, f: boolean) => { this.focused = f ? i : (this.focused === i ? null : this.focused) }),
      onTyping: this.memo('onTyping:bound', [], () => (v: boolean) => { this.typing = v }),
    }))
  }

  get options_props() {
    return this.memo('options_props', [this.route.avoid, this.route.excludeUnsupported, this.route.mode, this.units, this.schedule], () => ({
      avoid: this.route.avoid, setAvoid: this.route.setAvoid, excludeUnsupported: this.route.excludeUnsupported,
      showAvoid: this.route.mode !== 'plane', units: this.units, setUnits: this.setUnits,
      schedule: this.schedule, setSchedule: this.memo('setSchedule:bound', [], () => (s: Schedule) => { this.schedule = s }),
    }))
  }

  get suggestions_props() {
    return this.memo('suggestions_props', [this.props.history, this.target], () => ({
      history: this.props.history,
      onPick: this.memo('onPick:bound', [this.target], () => (lat: number, lng: number, label: string) => this.props.onSetWaypoint(this.target, lat, lng, label)),
    }))
  }

  // --- MapsRouteActions (native element) ---
  actions_print(_s: unknown, _e: EventArgs) { this.print() }

  // --- MapsRouteResults (native element) ---
  results_set_selected(_s: unknown, e: ValueChangedEventArgs) { this.route.setSelected(e.value as number) }
  results_set_details(_s: unknown, e: ValueChangedEventArgs) { this.detailsOpen = e.value as boolean }
  results_start_nav(_s: unknown, _e: EventArgs) { this.props.onStartNav() }
  results_simulate_nav(_s: unknown, _e: EventArgs) { this.props.onSimulateNav() }

  clear_all(_s: unknown, _a: MouseEventArgs) { this.props.onClearAll() }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRoutePanelStores = ReturnType<MapsRoutePanel['useStores']>

export default MapsRoutePanel.component()
