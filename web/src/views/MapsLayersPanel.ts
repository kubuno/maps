/**
 * Code-behind of `MapsLayersPanel.kbview` (converted from `MapsLayersPanel.tsx`).
 *
 * "Map details" panel (opened from the Layers button): basemap type, overlays, 3D relief, imported layers
 * (GeoJSON/KML), offline tile cache, and the Globe / Labels / contrast toggles.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsLayersPanel.kbview'
import * as __parts from './MapsLayersPanel.parts.tsx'
import type { BaseMap } from '../services/mapsLayers'

const TILE = 'relative w-16 h-16 rounded-xl flex items-center justify-center transition-all'
const TILE_ON = 'ring-2 ring-primary text-primary bg-primary-light'
const TILE_OFF = 'bg-surface-2 text-text-secondary group-hover:bg-surface-3'
const BOX = 'w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors'

export interface MapsLayersPanelProps {
  baseMap:        BaseMap
  onBaseMap:      (b: BaseMap) => void
  showLabels:     boolean
  onToggleLabels: () => void
  globe:          boolean
  onToggleGlobe:  () => void
  cycle:          boolean
  onToggleCycle:  () => void
  relief:         boolean
  onToggleRelief: () => void
  transit:        boolean
  onToggleTransit: () => void
  precip:         boolean
  onTogglePrecip: () => void
  terrain3d:      boolean
  onToggleTerrain3d: () => void
  imports:        { id: string; name: string }[]
  onImport:       (file: File) => void
  onRemoveImport: (id: string) => void
  online:         boolean
  cachedTiles:    number
  dlProgress:     { done: number; total: number } | null
  onDownloadArea: () => void
  onClearTiles:   () => void
  highContrast:   boolean
  onToggleContrast: () => void
  onClose:        () => void
}

export class MapsLayersPanel extends ViewBase {
  tr!: MapsLayersPanelStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  // Pass-through booleans referenced by the toggles' Check Visible bindings.
  get globe() { return this.props.globe }
  get showLabels() { return this.props.showLabels }
  get terrain3d() { return this.props.terrain3d }
  get highContrast() { return this.props.highContrast }

  get TileIcon() { return __parts.TileIcon }
  get ProgressBar() { return __parts.ProgressBar }
  get LayerImport() { return __parts.LayerImport }

  get title_label() { return this.tr('maps_layers_title', { defaultValue: 'Détails de la carte' }) }
  get overlays_label() { return this.tr('maps_layers_overlays', { defaultValue: 'Superpositions' }) }
  get basemap_label() { return this.tr('maps_layers_basemap', { defaultValue: 'Type de carte' }) }
  get offline_title() { return this.tr('maps_offline_title', { defaultValue: 'Cartes hors-ligne' }) }
  get offline_status() { return this.tr('maps_offline_status', { defaultValue: 'Hors-ligne' }) }
  get cached_label() { return this.tr('maps_offline_count', { count: this.props.cachedTiles, defaultValue: `${this.props.cachedTiles} tuiles en cache` }) }
  get download_label() { return this.tr('maps_offline_download', { defaultValue: 'Télécharger cette zone' }) }
  get clear_label() { return this.tr('maps_offline_clear', { defaultValue: 'Vider le cache' }) }
  get import_label() { return this.tr('maps_layers_import', { defaultValue: 'Calques importés' }) }
  get import_hint() { return this.tr('maps_import_hint', { defaultValue: 'GeoJSON ou KML à superposer sur la carte.' }) }
  get globe_label() { return this.tr('maps_globe_view', { defaultValue: 'Vue Globe' }) }
  get labels_label() { return this.tr('maps_labels', { defaultValue: 'Libellés' }) }
  get terrain_label() { return this.tr('maps_terrain_3d', { defaultValue: 'Relief 3D' }) }
  get contrast_label() { return this.tr('maps_high_contrast', { defaultValue: 'Contraste élevé' }) }

  get show_offline_badge() { return !this.props.online }
  get show_progress() { return !!this.props.dlProgress }
  get show_offline_actions() { return !this.props.dlProgress }
  get show_clear() { return this.props.cachedTiles > 0 }
  get progress_props() {
    return this.memo('progress_props', [this.props.dlProgress], () => ({
      done: this.props.dlProgress?.done ?? 0,
      total: this.props.dlProgress?.total ?? 0,
    }))
  }
  get import_props() {
    return this.memo('import_props', [this.tr, this.props.onImport], () => ({
      label: this.tr('maps_import_file', { defaultValue: 'Importer' }),
      onImport: this.props.onImport,
    }))
  }
  get show_import_hint() { return this.props.imports.length === 0 }
  get show_imports() { return this.props.imports.length > 0 }

  get globe_box_class() { return `${BOX} ${this.props.globe ? 'bg-primary border-primary' : 'border-strong'}` }
  get labels_box_class() { return `${BOX} ${this.props.showLabels ? 'bg-primary border-primary' : 'border-strong'}` }
  get terrain_box_class() { return `${BOX} ${this.props.terrain3d ? 'bg-primary border-primary' : 'border-strong'}` }
  get contrast_box_class() { return `${BOX} ${this.props.highContrast ? 'bg-primary border-primary' : 'border-strong'}` }

  private tile(active: boolean, iconName: string, label: string, extra: Record<string, unknown>) {
    return {
      active,
      TileIcon: __parts.TileIcon,
      icon_props: { name: iconName },
      label,
      tile_class: `${TILE} ${active ? TILE_ON : TILE_OFF}`,
      tile_label_class: `text-[11px] text-center leading-tight ${active ? 'text-primary font-medium' : 'text-text-secondary'}`,
      ...extra,
    }
  }

  get rows_overlays() {
    return this.memo('rows_overlays', [this.props.cycle, this.props.transit, this.props.precip, this.props.relief, this.tr], () => [
      this.tile(this.props.cycle, 'Bike', this.tr('maps_layer_cycle', { defaultValue: 'Vélo' }), { key: 'cycle', which: 'cycle' }),
      this.tile(this.props.transit, 'Bus', this.tr('maps_layer_transit', { defaultValue: 'Transports' }), { key: 'transit', which: 'transit' }),
      this.tile(this.props.precip, 'CloudRain', this.tr('maps_layer_precip', { defaultValue: 'Pluie' }), { key: 'precip', which: 'precip' }),
      this.tile(this.props.relief, 'Mountain', this.tr('maps_layer_relief', { defaultValue: 'Relief' }), { key: 'relief', which: 'relief' }),
    ])
  }

  get rows_basemaps() {
    return this.memo('rows_basemaps', [this.props.baseMap, this.tr], () => {
      const b = this.props.baseMap
      return [
        this.tile(b === 'default', 'Map', this.tr('maps_base_default', { defaultValue: 'Par défaut' }), { key: 'default', base: 'default' }),
        this.tile(b === 'light', 'Sun', this.tr('maps_base_light', { defaultValue: 'Clair' }), { key: 'light', base: 'light' }),
        this.tile(b === 'terrain', 'Mountain', this.tr('maps_base_terrain', { defaultValue: 'Topographique' }), { key: 'terrain', base: 'terrain' }),
        this.tile(b === 'satellite', 'Satellite', this.tr('maps_base_satellite', { defaultValue: 'Satellite' }), { key: 'satellite', base: 'satellite' }),
        this.tile(b === 'offline', 'WifiOff', this.tr('maps_base_offline', { defaultValue: 'Hors-ligne' }), { key: 'offline', base: 'offline' }),
      ]
    })
  }

  get rows_imports() {
    return this.memo('rows_imports', [this.props.imports], () =>
      this.props.imports.map(im => ({ key: im.id, im, name: im.name })))
  }

  toggle_overlay(_sender: unknown, args: MouseEventArgs) {
    const { which } = (args as MouseEventArgs & { row: { which: string } }).row
    if (which === 'cycle') this.props.onToggleCycle()
    else if (which === 'transit') this.props.onToggleTransit()
    else if (which === 'precip') this.props.onTogglePrecip()
    else if (which === 'relief') this.props.onToggleRelief()
  }

  pick_base(_sender: unknown, args: MouseEventArgs) {
    const { base } = (args as MouseEventArgs & { row: { base: BaseMap } }).row
    this.props.onBaseMap(base)
  }

  remove_import(_sender: unknown, args: MouseEventArgs) {
    const { im } = (args as MouseEventArgs & { row: { im: { id: string } } }).row
    this.props.onRemoveImport(im.id)
  }

  download_area(_s: unknown, _a: MouseEventArgs) { this.props.onDownloadArea() }
  clear_tiles(_s: unknown, _a: MouseEventArgs) { this.props.onClearTiles() }
  toggle_globe(_s: unknown, _a: MouseEventArgs) { this.props.onToggleGlobe() }
  toggle_labels(_s: unknown, _a: MouseEventArgs) { this.props.onToggleLabels() }
  toggle_terrain3d(_s: unknown, _a: MouseEventArgs) { this.props.onToggleTerrain3d() }
  toggle_contrast(_s: unknown, _a: MouseEventArgs) { this.props.onToggleContrast() }
  close(_s: unknown, _a: MouseEventArgs) { this.props.onClose() }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsLayersPanelStores = ReturnType<MapsLayersPanel['useStores']>

export default MapsLayersPanel.component()
