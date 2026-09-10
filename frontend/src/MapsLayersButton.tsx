// Bottom-left « Calques » control: a 72×72 thumbnail of the *alternative*
// basemap (satellite imagery while the vector map is shown, a map tile while
// satellite is active) with the label over a dark gradient. Clicking toggles
// the MapsLayersPanel owned by the page.
//
// The thumbnail is a single static zoom-10 tile around the map centre (slippy
// map maths from mapOffline.ts), refreshed on `moveend` with a debounce.
// Offline, or when the tile fails to load, a neutral grey stands in.

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type maplibregl from 'maplibre-gl'
import { Layers } from 'lucide-react'
import { lonToTileX, latToTileY } from './mapOffline'
import type { BaseMap } from './mapsLayers'

interface Props {
  baseMap:  BaseMap
  mapRef:   RefObject<maplibregl.Map | null>
  mapReady: boolean
  online:   boolean
  /** Whether the layers panel is currently open (highlights the control). */
  open:     boolean
  onToggle: () => void
}

const THUMB_ZOOM = 10
const DEBOUNCE_MS = 400

// Satellite preview: ESRI World Imagery (same source as the satellite basemap).
function satelliteTile(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}
// Map preview while satellite is active: a plain raster map tile.
function mapTile(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

export function MapsLayersButton({ baseMap, mapRef, mapReady, online, open, onToggle }: Props) {
  const { t } = useTranslation()
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | null>(null)

  // Track the map centre (debounced on moveend).
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

  const showSatellite = baseMap !== 'satellite'
  let url: string | null = null
  if (center && online) {
    const x = lonToTileX(center.lng, THUMB_ZOOM)
    const y = latToTileY(center.lat, THUMB_ZOOM)
    url = showSatellite ? satelliteTile(THUMB_ZOOM, x, y) : mapTile(THUMB_ZOOM, x, y)
  }
  // Reset the error flag whenever the tile changes.
  useEffect(() => { setFailed(false) }, [url])

  const label = t('maps_layers_button', { defaultValue: 'Calques' })
  const hover = {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)' },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.boxShadow = '' },
  }

  return (
    <button type="button" onClick={onToggle} title={label} aria-label={label} aria-expanded={open}
      className={`relative w-[72px] h-[72px] rounded-lg overflow-hidden shadow-md border-2 border-white bg-surface-2 cursor-pointer transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${open ? 'ring-2 ring-primary' : ''}`}
      {...hover}>
      {url && !failed
        ? <img src={url} alt="" aria-hidden draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover select-none" />
        : <div className="absolute inset-0" style={{ background: showSatellite ? '#4a5560' : '#e6e8eb' }} />}
      {/* Dark gradient + label at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-8"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))' }} />
      <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-1 text-white text-xs font-medium leading-none"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
        <Layers size={13} strokeWidth={2.25} aria-hidden />
        {label}
      </div>
    </button>
  )
}
