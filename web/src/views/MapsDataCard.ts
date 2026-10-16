/**
 * Code-behind of `MapsDataCard.kbview` (converted from `MapsDataCard.tsx`).
 *
 * Rich card rendering maps envelopes (`maps.place` / `maps.route` / `maps.view`) inside CONSUMER modules
 * (chat, notes…). Registered on the `core.data-card` extension point from `entry.ts`, so consumers resolve
 * it dynamically and never import maps' code - when maps is not installed they fall back to a generic card.
 */
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ViewBase } from './MapsDataCard.kbview'
import type { MapMarker } from '../maps-app/MiniMap'
import { fmtDistance, fmtDurationShort } from '../services/routing'
import type { DataCardProps, MapsPlaceData, MapsRouteData, MapsViewData } from '../services/kubunoData'

export type MapsDataCardProps = DataCardProps

export class MapsDataCard extends ViewBase {
  tr!: MapsDataCardStores['t']
  nav!: MapsDataCardStores['navigate']

  /** The screen's hooks that read nothing of the view (stores, translations…), as the TSX called them. */
  useStores() {
    const { t } = useTranslation('maps')
    const navigate = useNavigate()
    return { t, navigate }
  }

  /** Runs the hooks and publishes what they give as fields (the bindings, the getters and the methods read them). */
  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, nav: s.navigate })
  }

  get is_route() {
    return this.props.envelope.type === 'maps.route'
  }

  get is_place() {
    return !this.is_route
  }

  get open_tip() {
    return this.tr('maps_open_in_maps', { defaultValue: 'Ouvrir dans Maps' })
  }

  /** Points to plot on the preview map (route waypoints, or the single place/view point). */
  get markers(): MapMarker[] {
    return this.memo('markers', [this.props.envelope], () => {
      const envelope = this.props.envelope
      if (envelope.type === 'maps.route') {
        const d = envelope.data as MapsRouteData
        const wps = Array.isArray(d.waypoints) ? d.waypoints : []
        return wps.map((w, i) => ({
          lat: w.lat, lng: w.lng, label: w.label,
          color: i === 0 ? '#1e8e3e' : i === wps.length - 1 ? '#d93025' : '#1a73e8',
        }))
      }
      const d = envelope.data as MapsPlaceData & MapsViewData
      const label = envelope.title ?? `${d.lat}, ${d.lng}`
      return [{ lat: d.lat, lng: d.lng, label }]
    })
  }

  get subtitle(): string {
    const envelope = this.props.envelope
    if (envelope.type === 'maps.route') {
      const d = envelope.data as MapsRouteData
      return `${fmtDistance(d.distance)} · ${fmtDurationShort(d.duration)}`
    }
    const d = envelope.data as MapsPlaceData & MapsViewData
    return envelope.type === 'maps.view'
      ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`
      : (d.display_name && d.display_name !== d.name ? d.display_name : `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`)
  }

  get show_subtitle() {
    return !!this.subtitle
  }

  open() {
    if (this.props.envelope.href) this.nav(this.props.envelope.href)
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsDataCardStores = ReturnType<MapsDataCard['useStores']>

export default MapsDataCard.component()
