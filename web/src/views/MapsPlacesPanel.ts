/**
 * Code-behind of `MapsPlacesPanel.kbview` (converted from `MapsPlacesPanel.tsx`).
 *
 * Saved-places panel: list filters (chips), a filter search, import/export, the saved-place rows and the
 * recent-searches list.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsPlacesPanel.kbview'
import * as __parts from './MapsPlacesPanel.parts.tsx'

export interface PlaceItem {
  id: string; name: string; address: string | null; lat: number; lng: number
  icon: string; category: string | null; user_note: string | null
  user_tags: string[]; collection_id: string | null
}
export interface Collection { id: string; name: string; icon: string; color: string; place_count: number }
export interface HistoryEntry {
  id: string; query: string; result_name: string | null
  result_lat: number | null; result_lng: number | null; searched_at: string
}
export interface PlacePatch { collection_id?: string | null; user_note?: string; user_tags?: string[]; name?: string }

const CHIP = 'flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors'

export interface MapsPlacesPanelProps {
  places: PlaceItem[]; collections: Collection[]; history: HistoryEntry[]
  onFly: (lat: number, lng: number) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: PlacePatch) => void
  onCreateCollection: (name: string, color: string) => void
  onDeleteCollection: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onClearHistory: () => void
}

export class MapsPlacesPanel extends ViewBase {
  @bind accessor filter = 'all'   // 'all' | 'none' | collectionId
  @bind accessor q = ''
  @bind accessor creating = false
  tr!: MapsPlacesPanelStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  get search_placeholder() { return this.tr('maps_places_search', { defaultValue: 'Filtrer mes lieux…' }) }
  get export_label() { return this.tr('maps_places_export', { defaultValue: 'Exporter (GeoJSON)' }) }
  get new_list_label() { return this.tr('maps_list_new', { defaultValue: 'Nouvelle liste' }) }
  get empty_label() { return `${this.tr('maps_places_empty')} ${this.tr('maps_places_empty_hint')}` }
  get recent_label() { return this.tr('maps_recent', { defaultValue: 'Récents' }) }
  get recent_clear_label() { return this.tr('maps_recent_clear', { defaultValue: 'Effacer' }) }

  get filtered() {
    return this.memo('filtered', [this.props.places, this.filter, this.q], () => {
      const needle = this.q.trim().toLowerCase()
      return this.props.places.filter(p => {
        if (this.filter === 'none' && p.collection_id) return false
        if (this.filter !== 'all' && this.filter !== 'none' && p.collection_id !== this.filter) return false
        if (needle && !(`${p.name} ${(p.user_tags ?? []).join(' ')} ${p.address ?? ''}`.toLowerCase().includes(needle))) return false
        return true
      })
    })
  }

  get rows_chips() {
    return this.memo('rows_chips', [this.props.places, this.props.collections, this.filter, this.tr], () => {
      const chipClass = (id: string) => `${CHIP} ${this.filter === id ? 'bg-primary text-white border-primary' : 'bg-surface-0 text-text-secondary border-border hover:bg-surface-1'}`
      const deleteLabel = this.tr('common_delete', { defaultValue: 'Supprimer' })
      type Chip = { key: string; id: string; label: string; count: string; show_count: boolean; has_color: boolean; dot_props: { color: string }; ChipDot: typeof __parts.ChipDot; chip_class: string; deletable: boolean; delete_label: string }
      const rows: Chip[] = []
      const mk = (id: string, label: string, opts: { count?: number; color?: string; deletable?: boolean } = {}): Chip => ({
        key: id, id, label,
        count: typeof opts.count === 'number' ? String(opts.count) : '',
        show_count: typeof opts.count === 'number',
        has_color: !!opts.color,
        dot_props: { color: opts.color ?? '' },
        ChipDot: __parts.ChipDot,
        chip_class: chipClass(id),
        deletable: !!opts.deletable,
        delete_label: deleteLabel,
      })
      rows.push(mk('all', this.tr('maps_places_all', { defaultValue: 'Tous' }), { count: this.props.places.length }))
      for (const c of this.props.collections) rows.push(mk(c.id, c.name, { color: c.color, count: c.place_count, deletable: true }))
      rows.push(mk('none', this.tr('maps_places_no_list', { defaultValue: 'Sans liste' })))
      return rows
    })
  }

  get PlaceRow() { return __parts.PlaceRow }
  get rows_places() {
    return this.memo('rows_places', [this.filtered, this.props.collections, this.props.onFly, this.props.onDelete, this.props.onUpdate], () =>
      this.filtered.map(p => ({
        key: p.id,
        PlaceRow: __parts.PlaceRow,
        row_props: { place: p, collections: this.props.collections, onFly: this.props.onFly, onDelete: this.props.onDelete, onUpdate: this.props.onUpdate },
      })))
  }

  get rows_recents() {
    return this.memo('rows_recents', [this.props.history], () =>
      this.props.history.slice(0, 10).map(h => ({
        key: h.id,
        entry: h,
        label: h.result_name || h.query,
      })))
  }

  get show_empty() { return this.filtered.length === 0 }
  get show_list() { return this.filtered.length > 0 }
  get show_recents() { return this.props.history.length > 0 }

  get ChipDot() { return __parts.ChipDot }

  get CreateListForm() { return __parts.CreateListForm }
  get create_props() {
    return this.memo('create_props', [this.props.onCreateCollection], () => ({
      onCreate: (name: string, color: string) => { this.props.onCreateCollection(name, color); this.creating = false },
    }))
  }

  get PlacesImport() { return __parts.PlacesImport }
  get import_props() {
    return this.memo('import_props', [this.tr, this.props.onImport], () => ({
      title: this.tr('maps_places_import', { defaultValue: 'Importer' }),
      onImport: this.props.onImport,
    }))
  }

  set_filter(_s: unknown, args: MouseEventArgs) {
    const { id } = (args as MouseEventArgs & { row: { id: string } }).row
    this.filter = id
  }
  delete_collection(_s: unknown, args: MouseEventArgs) {
    const { id } = (args as MouseEventArgs & { row: { id: string } }).row
    this.props.onDeleteCollection(id)
  }
  toggle_creating(_s: unknown, _a: MouseEventArgs) { this.creating = !this.creating }
  export_places(_s: unknown, _a: MouseEventArgs) { this.props.onExport() }
  clear_history(_s: unknown, _a: MouseEventArgs) { this.props.onClearHistory() }
  fly_recent(_s: unknown, args: MouseEventArgs) {
    const { entry } = (args as MouseEventArgs & { row: { entry: HistoryEntry } }).row
    if (entry.result_lat != null && entry.result_lng != null) this.props.onFly(entry.result_lat, entry.result_lng)
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPlacesPanelStores = ReturnType<MapsPlacesPanel['useStores']>

export default MapsPlacesPanel.component()
