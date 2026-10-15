/**
 * Code-behind of `MapsRouteModes.kbview` (converted from `MapsRouteModes.tsx`).
 *
 * Mode row of the route panel: six icon buttons (active one on a light primary pill) and the close cross.
 * Public transport has no data source in Kubuno: its button stays visible but inert, never faked.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsRouteModes.kbview'
import * as __parts from './MapsRouteModes.parts.tsx'
import type { RouteMode } from '../maps-app/useRouteModes'

// Re-exported for other screens (MapsRouteResults) that import them from this module.
export { modeIcon, useModeLabel } from './MapsRouteModes.parts.tsx'

export interface MapsRouteModesProps {
  mode:    RouteMode
  setMode: (m: RouteMode) => void
  onClose: () => void
}

const ORDER: RouteMode[] = ['recommended', 'driving', 'transit', 'foot', 'cycling', 'plane']
const BASE = 'h-10 w-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors'

export class MapsRouteModes extends ViewBase {
  tr!: MapsRouteModesStores['t']
  label!: (m: RouteMode) => string

  useStores() {
    const { t } = useTranslation('maps')
    const label = __parts.useModeLabel()
    return { t, label }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, label: s.label })
  }

  get close_label() {
    return this.tr('maps_route_close', { defaultValue: "Fermer l'itinéraire" })
  }

  get rows_modes() {
    return this.memo('rows_modes', [this.props.mode, this.label, this.tr], () =>
      ORDER.map((m) => {
        const active = m === this.props.mode
        const disabled = m === 'transit'
        const tip = disabled
          ? this.tr('maps_route_mode_transit_unavailable', { defaultValue: 'Transports en commun : pas encore disponible' })
          : this.label(m)
        const btn_class = `${BASE} ${
          active ? 'bg-primary-light text-primary'
          : disabled ? 'text-text-primary opacity-50 cursor-not-allowed'
          : 'text-text-primary hover:bg-surface-2'}`
        return { key: m, mode: m, disabled, tip, btn_class, ModeIcon: __parts.ModeIcon, icon_props: { mode: m } }
      }),
    )
  }

  pick(_sender: unknown, args: MouseEventArgs) {
    const { mode, disabled } = (args as MouseEventArgs & { row: RowOfModes }).row
    if (!disabled) this.props.setMode(mode)
  }

  close(_sender: unknown, _args: MouseEventArgs) {
    this.props.onClose()
  }
}

type RowOfModes = MapsRouteModes['rows_modes'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRouteModesStores = ReturnType<MapsRouteModes['useStores']>

export default MapsRouteModes.component()
