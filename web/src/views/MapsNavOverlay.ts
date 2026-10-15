/**
 * Code-behind of `MapsNavOverlay.kbview` (converted from `MapsNavOverlay.tsx`).
 *
 * The turn-by-turn navigation overlay: the maneuver banner, the remaining time/distance bar and the
 * "navigation active" pill, drawn over the map during guidance.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsNavOverlay.kbview'
import * as __parts from './MapsNavOverlay.parts.tsx'
import type { NavState } from '../services/navigation'

export interface MapsNavOverlayProps {
  state:      NavState
  simulating: boolean
  onStop:     () => void
}

function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export class MapsNavOverlay extends ViewBase {
  tr!: MapsNavOverlayStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  get ManeuverIcon() {
    return __parts.ManeuverIcon
  }

  get maneuver_props() {
    return this.memo('maneuver_props', [this.props.state.iconKey], () => ({ iconKey: this.props.state.iconKey }))
  }

  get dist_to_maneuver() {
    return fmtDist(this.props.state.distToManeuver)
  }

  get instruction() {
    return this.props.state.instruction || this.tr('maps_nav_continue', { defaultValue: 'Continuez' })
  }

  get remaining_time() {
    return fmtTime(this.props.state.remainingTime)
  }

  get remaining_dist() {
    return fmtDist(this.props.state.remaining)
  }

  get rerouting_label() {
    return this.tr('maps_nav_rerouting', { defaultValue: 'Hors itinéraire — recalcul…' })
  }

  get sim_label() {
    return this.tr('maps_nav_sim', { defaultValue: 'Simulation' })
  }

  get eta_label() {
    return this.tr('maps_nav_eta', { defaultValue: 'Restant' })
  }

  get dist_label() {
    return this.tr('maps_nav_dist', { defaultValue: 'Distance' })
  }

  get stop_label() {
    return this.tr('maps_nav_stop', { defaultValue: 'Quitter' })
  }

  get active_label() {
    return this.tr('maps_nav_active', { defaultValue: 'Navigation' })
  }

  stop(_sender: unknown, _args: MouseEventArgs) {
    this.props.onStop()
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsNavOverlayStores = ReturnType<MapsNavOverlay['useStores']>

export default MapsNavOverlay.component()
