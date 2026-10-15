/**
 * Code-behind of `MapsMiniPanel.kbview` (converted from `MapsMiniPanel.tsx`).
 *
 * Maps side panel — the user's saved places, one click from wherever they are. Lists saved places and
 * hands off to the module (or to directions) rather than embedding a map beside every other page.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '@kubuno/sdk'

import { ViewBase } from './MapsMiniPanel.kbview'

export type MapsMiniPanelProps = Record<string, never>

interface Place {
  id:       string
  name:     string
  address:  string | null
  lat:      number
  lng:      number
  category: string | null
}

export class MapsMiniPanel extends ViewBase {
  tr!: MapsMiniPanelStores['t']
  nav!: MapsMiniPanelStores['navigate']
  places: Place[] = []
  isLoading = false

  useStores() {
    const { t } = useTranslation('maps')
    const navigate = useNavigate()
    return { t, navigate }
  }

  useHooks() {
    const q = useQuery({
      queryKey: ['maps-mini-places'],
      queryFn:  () => api.get<{ places: Place[] }>('/maps/places').then(r => r.data.places),
    })
    const places = q.data ?? []
    this.publish({ places, isLoading: q.isLoading })
    return { places, isLoading: q.isLoading }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, nav: s.navigate })
    this.useHooks()
  }

  get title_label() {
    return this.tr('maps_places_title', { defaultValue: 'Mes lieux' })
  }

  get empty_label() {
    return this.tr('maps_places_empty', { defaultValue: 'Aucun lieu enregistré.' })
  }

  get show_empty() {
    return !this.isLoading && this.places.length === 0
  }

  get show_list() {
    return !this.isLoading && this.places.length > 0
  }

  get rows_places() {
    return this.memo('rows_places', [this.places, this.tr], () => {
      const directions_label = this.tr('maps_directions', { defaultValue: 'Itinéraire' })
      return this.places.slice(0, 20).map(p => ({
        key: p.id,
        place: p,
        name: p.name,
        address: p.address ?? '',
        show_address: !!p.address,
        directions_label,
      }))
    })
  }

  open(_sender: unknown, args: MouseEventArgs) {
    const { place } = (args as MouseEventArgs & { row: RowOfPlaces }).row
    this.nav(`/maps#place/${place.id}`)
  }

  route(_sender: unknown, args: MouseEventArgs) {
    const { place } = (args as MouseEventArgs & { row: RowOfPlaces }).row
    this.nav(`/maps#route/${place.lat},${place.lng}`)
  }
}

type RowOfPlaces = MapsMiniPanel['rows_places'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsMiniPanelStores = ReturnType<MapsMiniPanel['useStores']>

export default MapsMiniPanel.component()
