/**
 * Code-behind of `MapsRouteSuggestions.kbview` (converted from `MapsRouteSuggestions.tsx`).
 *
 * Suggestions under the route fields while one is empty or focused: the device position, the saved
 * Home / Work shortcuts, then recent searches. Picking a row fills the target field.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsRouteSuggestions.kbview'
import * as __parts from './MapsRouteSuggestions.parts.tsx'
import { buildNominatimSearchUrl } from '../services/geocoding'
import type { HistoryEntry } from './MapsPlacesPanel'
import { fold, historyTitle } from '../maps-app/MapsSearchDropdown'
import { fetchResults } from '../maps-app/searchRows'
import { useSavedPlaces, savedPlaceSubtitle, type SavedPlace } from '../maps-app/useSavedPlaces'

/** Rows shown at most under the fields (your position + shortcuts + recents). */
export const SUGGESTION_ROWS_MAX = 10

const CIRCLE = 'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0'

export interface MapsRouteSuggestionsProps {
  history: HistoryEntry[]
  onPick:  (lat: number, lng: number, label: string) => void
}

export class MapsRouteSuggestions extends ViewBase {
  @bind accessor busy: string | null = null
  @bind accessor error: string | null = null
  tr!: MapsRouteSuggestionsStores['t']
  home!: SavedPlace | null
  work!: SavedPlace | null

  useStores() {
    const { t } = useTranslation('maps')
    const { home, work } = useSavedPlaces()
    return { t, home, work }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, home: s.home ?? null, work: s.work ?? null })
  }

  get show_error() {
    return !!this.error
  }

  get rows() {
    return this.memo('rows', [this.props.history, this.home, this.work, this.busy, this.tr], () => {
      const tinted = `${CIRCLE} bg-primary-light text-primary`
      const plain = `${CIRCLE} bg-surface-2 text-text-primary`
      const yourPosition = this.tr('maps_route_your_location', { defaultValue: 'Votre position' })
      type Row = {
        key: string; kind: 'me' | 'home' | 'work' | 'recent'; entry?: HistoryEntry
        circle_class: string; Icon: typeof __parts.SuggIcon; icon_props: { name: 'LocateFixed' | 'Home' | 'Briefcase' | 'Clock' }
        title: string; subtitle: string; show_subtitle: boolean; show_busy: boolean
      }
      const rows: Row[] = []
      rows.push({
        key: 'me', kind: 'me', circle_class: tinted, Icon: __parts.SuggIcon, icon_props: { name: 'LocateFixed' },
        title: yourPosition, subtitle: '', show_subtitle: false, show_busy: this.busy === 'me',
      })
      if (this.home) {
        const title = this.tr('maps_saved_home', { defaultValue: 'Domicile' })
        const subtitle = savedPlaceSubtitle(this.home) ?? ''
        rows.push({ key: 'home', kind: 'home', circle_class: tinted, Icon: __parts.SuggIcon, icon_props: { name: 'Home' }, title, subtitle, show_subtitle: !!subtitle, show_busy: false })
      }
      if (this.work) {
        const title = this.tr('maps_saved_work', { defaultValue: 'Travail' })
        const subtitle = savedPlaceSubtitle(this.work) ?? ''
        rows.push({ key: 'work', kind: 'work', circle_class: tinted, Icon: __parts.SuggIcon, icon_props: { name: 'Briefcase' }, title, subtitle, show_subtitle: !!subtitle, show_busy: false })
      }
      const shortcuts = (this.home ? 1 : 0) + (this.work ? 1 : 0)
      const seen = new Set<string>()
      for (const e of this.props.history) {
        const key = fold(historyTitle(e))
        if (seen.has(key)) continue
        seen.add(key)
        const rest = (e.result_name ?? '').split(',').slice(1).map(s => s.trim()).filter(Boolean)
        const subtitle = rest.length ? rest.join(', ') : ''
        rows.push({ key: e.id, kind: 'recent', entry: e, circle_class: plain, Icon: __parts.SuggIcon, icon_props: { name: 'Clock' }, title: historyTitle(e), subtitle, show_subtitle: !!subtitle, show_busy: this.busy === e.id })
        if (rows.length >= SUGGESTION_ROWS_MAX - shortcuts) break
      }
      return rows
    })
  }

  private locate() {
    if (this.busy) return
    const unavailable = this.tr('maps_route_location_unavailable', { defaultValue: 'Position indisponible' })
    if (!navigator.geolocation) { this.error = unavailable; return }
    this.busy = 'me'; this.error = null
    navigator.geolocation.getCurrentPosition(
      pos => { this.busy = null; this.props.onPick(pos.coords.latitude, pos.coords.longitude, this.tr('maps_route_your_location', { defaultValue: 'Votre position' })) },
      () => { this.busy = null; this.error = unavailable },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  private async pickHistory(e: HistoryEntry) {
    if (this.busy) return
    if (e.result_lat != null && e.result_lng != null) { this.props.onPick(e.result_lat, e.result_lng, historyTitle(e)); return }
    this.busy = e.id; this.error = null
    try {
      const found = await fetchResults(buildNominatimSearchUrl(e.query, 1))
      if (!found.length) { this.error = this.tr('maps_search_no_result', { defaultValue: 'Aucun résultat pour cette recherche' }); return }
      this.props.onPick(parseFloat(found[0].lat), parseFloat(found[0].lon), historyTitle(e))
    } catch {
      this.error = this.tr('maps_geocoding_unavailable', { defaultValue: 'Service de géocodage indisponible' })
    } finally { this.busy = null }
  }

  pick(_sender: unknown, args: MouseEventArgs) {
    const row = (args as MouseEventArgs & { row: RowOfSuggestions }).row
    switch (row.kind) {
      case 'me': this.locate(); break
      case 'home': if (this.home) this.props.onPick(this.home.lat, this.home.lng, this.tr('maps_saved_home', { defaultValue: 'Domicile' })); break
      case 'work': if (this.work) this.props.onPick(this.work.lat, this.work.lng, this.tr('maps_saved_work', { defaultValue: 'Travail' })); break
      case 'recent': if (row.entry) void this.pickHistory(row.entry); break
    }
  }
}

type RowOfSuggestions = MapsRouteSuggestions['rows'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRouteSuggestionsStores = ReturnType<MapsRouteSuggestions['useStores']>

export default MapsRouteSuggestions.component()
