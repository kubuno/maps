/**
 * Code-behind of `MapsPoiResultsPanel.kbview` (converted from `MapsPoiResultsPanel.tsx`).
 *
 * Explore-results panel (POI by category): the transient list shown in the left rail after tapping a
 * category chip.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsPoiResultsPanel.kbview'
import { haversineM } from '../services/mapMarkers'
import type { Poi } from '../services/poi'

export interface MapsPoiResultsPanelProps {
  title:    string
  emoji:    string
  pois:     Poi[]
  center:   { lat: number; lng: number } | null
  loading:  boolean
  error:    string | null
  onSelect: (p: Poi) => void
  onClose:  () => void
}

const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export class MapsPoiResultsPanel extends ViewBase {
  tr!: MapsPoiResultsPanelStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  /** The header meta and the list show only once the search is neither loading nor failed. */
  get show_meta() {
    return !this.props.loading && !this.props.error
  }

  get show_error() {
    return !this.props.loading && !!this.props.error
  }

  get count_label() {
    return this.tr('maps_poi_count', { count: this.props.pois.length, defaultValue: `${this.props.pois.length} lieu(x)` })
  }

  get searching_label() {
    return this.tr('maps_calculating', { defaultValue: 'Recherche…' })
  }

  get rows_pois() {
    return this.memo('rows_pois', [this.props.pois, this.props.center, this.tr], () => {
      const center = this.props.center
      return this.props.pois.map((p) => {
        const dist = center ? haversineM(center.lat, center.lng, p.lat, p.lng) : null
        const category = (p.tags?.cuisine || p.tags?.amenity || p.tags?.shop || p.tags?.tourism || p.category || '').replace(/_/g, ' ')
        return {
          key: `${p.osm_type}-${p.osm_id}`,
          poi: p,
          icon: p.icon || '📍',
          name: p.name || this.tr('maps_poi_unnamed', { defaultValue: 'Lieu sans nom' }),
          category,
          dist: dist !== null ? fmt(dist) : '',
          show_dist: dist !== null,
        }
      })
    })
  }

  select(_sender: unknown, args: MouseEventArgs) {
    const { poi } = (args as MouseEventArgs & { row: RowOfPois }).row
    this.props.onSelect(poi)
  }

  close(_sender: unknown, _args: MouseEventArgs) {
    this.props.onClose()
  }
}

type RowOfPois = MapsPoiResultsPanel['rows_pois'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPoiResultsPanelStores = ReturnType<MapsPoiResultsPanel['useStores']>

export default MapsPoiResultsPanel.component()
