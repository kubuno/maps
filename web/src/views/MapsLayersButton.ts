/**
 * Code-behind of `MapsLayersButton.kbview` (converted from `MapsLayersButton.tsx`).
 *
 * Bottom-left "Calques" control: a 72×72 thumbnail of the *alternative* basemap (satellite imagery while
 * the vector map is shown, a map tile while satellite is active) with the label over a dark gradient.
 * Clicking toggles the MapsLayersPanel owned by the page.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type maplibregl from 'maplibre-gl'

import { ViewBase } from './MapsLayersButton.kbview'
import { lonToTileX, latToTileY } from '../services/mapOffline'
import type { BaseMap } from '../services/mapsLayers'

const THUMB_ZOOM = 10
const DEBOUNCE_MS = 400
const BASE = 'relative w-[72px] h-[72px] rounded-lg overflow-hidden shadow-md border-2 border-white bg-surface-2 cursor-pointer transition-shadow outline-none hover:shadow-lg'

// Satellite preview: ESRI World Imagery (same source as the satellite basemap).
function satelliteTile(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}
// Map preview while satellite is active: a plain raster map tile.
function mapTile(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

export interface MapsLayersButtonProps {
  baseMap:  BaseMap
  mapRef:   RefObject<maplibregl.Map | null>
  mapReady: boolean
  online:   boolean
  /** Whether the layers panel is currently open (highlights the control). */
  open:     boolean
  onToggle: () => void
}

export class MapsLayersButton extends ViewBase {
  @bind accessor failed = false
  tr!: MapsLayersButtonStores['t']
  url: string | null = null
  showSatellite = true
  private lastUrl: string | null = null

  useStores() {
    const { t } = useTranslation()
    return { t }
  }

  useHooks() {
    const mapRef = this.props.mapRef
    const mapReady = this.props.mapReady
    const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
    const timer = useRef<number | null>(null)
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return
      const read = () => { const c = map.getCenter(); setCenter({ lat: c.lat, lng: c.lng }) }
      const onMove = () => {
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(read, DEBOUNCE_MS)
      }
      read()
      map.on('moveend', onMove)
      return () => {
        map.off('moveend', onMove)
        if (timer.current !== null) window.clearTimeout(timer.current)
      }
    }, [mapRef, mapReady])

    const showSatellite = this.props.baseMap !== 'satellite'
    let url: string | null = null
    if (center && this.props.online) {
      const x = lonToTileX(center.lng, THUMB_ZOOM)
      const y = latToTileY(center.lat, THUMB_ZOOM)
      url = showSatellite ? satelliteTile(THUMB_ZOOM, x, y) : mapTile(THUMB_ZOOM, x, y)
    }
    // Reset the error flag whenever the tile changes (the original effect on [url]).
    if (url !== this.lastUrl) { this.lastUrl = url; this.failed = false }
    this.publish({ url, showSatellite })
    return { url, showSatellite }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
    this.useHooks()
  }

  get label() {
    return this.tr('maps_layers_button', { defaultValue: 'Calques' })
  }

  get btn_class() {
    return `${BASE} ${this.props.open ? 'ring-2 ring-primary' : ''}`
  }

  get show_img() {
    return !!this.url && !this.failed
  }

  get show_placeholder() {
    return !this.show_img
  }

  get placeholder_class() {
    return `absolute inset-0 ${this.showSatellite ? 'bg-[#4a5560]' : 'bg-[#e6e8eb]'}`
  }

  toggle(_sender: unknown, _args: MouseEventArgs) {
    this.props.onToggle()
  }

  tile_failed() {
    this.failed = true
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsLayersButtonStores = ReturnType<MapsLayersButton['useStores']>

export default MapsLayersButton.component()
