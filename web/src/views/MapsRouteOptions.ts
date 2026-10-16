/**
 * Code-behind of `MapsRouteOptions.kbview` (converted from `MapsRouteOptions.tsx`).
 *
 * "Leave now ▾" schedule dropdown + the "Options" disclosure (avoid classes, units). There is no traffic
 * model in Kubuno, so the schedule never changes the routing request - the result cards only derive an
 * "arrive/leave around HH:MM" from it.
 */
import { bind, type MouseEventArgs, type ValueChangedEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsRouteOptions.kbview'
import * as __parts from './MapsRouteOptions.parts.tsx'
import type { AvoidSet } from '../maps-app/useRouteModes'
import type { DistanceUnits } from '../services/routing'

export type Schedule = { kind: 'now' } | { kind: 'depart' | 'arrive'; at: string }

/** `datetime-local` value of the next 5-minute mark. */
function nextSlot(): string {
  const d = new Date(Date.now() + 5 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Schedule anchor as a Date (now, or the picked local time); null when unparsable. */
export function scheduleDate(s: Schedule): Date | null {
  if (s.kind === 'now') return new Date()
  const d = new Date(s.at)
  return isNaN(d.getTime()) ? null : d
}

const UNIT = 'h-8 px-3 text-sm font-medium'

export interface MapsRouteOptionsProps {
  avoid:     AvoidSet
  setAvoid:  (a: AvoidSet) => void
  excludeUnsupported: boolean
  showAvoid: boolean
  units:     DistanceUnits
  setUnits:  (u: DistanceUnits) => void
  schedule:  Schedule
  setSchedule: (s: Schedule) => void
}

export class MapsRouteOptions extends ViewBase {
  @bind accessor open = false
  tr!: MapsRouteOptionsStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  get closed() { return !this.open }

  private fmtTime(iso: string) {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
  }

  get schedule_label() {
    const s = this.props.schedule
    return s.kind === 'now'
      ? this.tr('maps_route_leave_now', { defaultValue: 'Partir maintenant' })
      : s.kind === 'depart'
        ? this.tr('maps_route_depart_at', { defaultValue: 'Partir à {{time}}', time: this.fmtTime(s.at) })
        : this.tr('maps_route_arrive_at', { defaultValue: 'Arriver à {{time}}', time: this.fmtTime(s.at) })
  }

  get options_label() { return this.tr('maps_route_options', { defaultValue: 'Options' }) }
  get units_label() { return this.tr('maps_route_units', { defaultValue: 'Unités' }) }
  get exclude_label() { return this.tr('maps_route_exclude_unsupported', { defaultValue: "Le serveur d'itinéraires ne prend pas en charge ces options" }) }

  get schedule_items() {
    return this.memo('schedule_items', [this.props.schedule, this.tr], () => {
      const s = this.props.schedule
      const at = s.kind === 'now' ? nextSlot() : s.at
      return [
        { label: this.tr('maps_route_leave_now', { defaultValue: 'Partir maintenant' }), checked: s.kind === 'now', onClick: () => this.props.setSchedule({ kind: 'now' }) },
        { label: this.tr('maps_route_depart_at_menu', { defaultValue: 'Partir à…' }), checked: s.kind === 'depart', onClick: () => this.props.setSchedule({ kind: 'depart', at }) },
        { label: this.tr('maps_route_arrive_at_menu', { defaultValue: 'Arriver à…' }), checked: s.kind === 'arrive', onClick: () => this.props.setSchedule({ kind: 'arrive', at }) },
      ]
    })
  }

  get show_datetime() { return this.props.schedule.kind !== 'now' }

  get ScheduleInput() { return __parts.ScheduleInput }

  get schedule_input_props() {
    return this.memo('schedule_input_props', [this.props.schedule, this.schedule_label], () => ({
      value: this.props.schedule.kind === 'now' ? '' : this.props.schedule.at,
      label: this.schedule_label,
      onChange: (v: string) => {
        const s = this.props.schedule
        if (s.kind !== 'now') this.props.setSchedule({ kind: s.kind, at: v })
      },
    }))
  }

  // Avoid checkboxes (bound one-way to the props; each handler toggles via setAvoid).
  get avoid_motorway() { return this.props.avoid.motorway }
  get avoid_toll() { return this.props.avoid.toll }
  get avoid_ferry() { return this.props.avoid.ferry }
  get avoid_motorway_label() { return this.tr('maps_route_avoid_motorways', { defaultValue: 'Éviter les autoroutes' }) }
  get avoid_toll_label() { return this.tr('maps_route_avoid_tolls', { defaultValue: 'Éviter les péages' }) }
  get avoid_ferry_label() { return this.tr('maps_route_avoid_ferries', { defaultValue: 'Éviter les ferries' }) }

  get show_exclude() { return this.props.showAvoid && this.props.excludeUnsupported }

  get is_km() { return this.props.units === 'km' }
  get km_class() { return `${UNIT} ${this.is_km ? 'bg-primary-light text-primary' : 'text-text-secondary'}` }
  get mi_class() { return `${UNIT} ${!this.is_km ? 'bg-primary-light text-primary' : 'text-text-secondary'}` }

  toggle_open(_s: unknown, _a: MouseEventArgs) { this.open = !this.open }
  avoid_motorway_changed(_s: unknown, _a: ValueChangedEventArgs) { this.props.setAvoid({ ...this.props.avoid, motorway: !this.props.avoid.motorway }) }
  avoid_toll_changed(_s: unknown, _a: ValueChangedEventArgs) { this.props.setAvoid({ ...this.props.avoid, toll: !this.props.avoid.toll }) }
  avoid_ferry_changed(_s: unknown, _a: ValueChangedEventArgs) { this.props.setAvoid({ ...this.props.avoid, ferry: !this.props.avoid.ferry }) }
  pick_km(_s: unknown, _a: MouseEventArgs) { this.props.setUnits('km') }
  pick_miles(_s: unknown, _a: MouseEventArgs) { this.props.setUnits('miles') }

  // Referenced by the kbview's `showAvoid` Visible binding.
  get showAvoid() { return this.props.showAvoid }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRouteOptionsStores = ReturnType<MapsRouteOptions['useStores']>

export default MapsRouteOptions.component()
