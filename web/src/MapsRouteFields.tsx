import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, GripVertical, MapPin, Plus, X } from 'lucide-react'
import { MapsAddressInput } from './MapsAddressInput'
import { placeDetails, formatAddress } from './geocoding'
import { hoverBg, BUTTON_HOVER } from './MapsSearchDropdown'
import type { LatLng } from './routing'

/** Origin + stops + destination: the most a route can carry. */
export const MAX_WAYPOINTS = 9

/** Red destination pin (own SVG: a filled lucide pin would lose its white hole). */
function DestinationPin() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12z" fill="var(--color-danger, #d93025)" />
      <circle cx="12" cy="10" r="2.6" fill="#fff" />
    </svg>
  )
}

/** Connector cell: hollow circle (origin), small circle (stop), red pin (destination), dots below. */
function Connector({ index, count }: { index: number; count: number }) {
  const last = index === count - 1
  return (
    <div className="relative w-6 h-14 flex items-center justify-center flex-shrink-0">
      {index === 0
        ? <span className="w-3 h-3 rounded-full border-2 border-text-secondary bg-surface-0" />
        : last
          ? <DestinationPin />
          : <span className="w-2.5 h-2.5 rounded-full border-2 border-text-tertiary bg-surface-0" />}
      {!last && (
        <span className="absolute left-1/2 -translate-x-1/2 top-[40px] h-[40px] flex flex-col items-center justify-between py-1">
          {[0, 1, 2].map(i => <span key={i} className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />)}
        </span>
      )}
    </div>
  )
}

/**
 * The stacked fields of the route panel with their connector column, the
 * swap button, drag-and-drop reordering of the points and the links under
 * them ("add a destination", "choose on the map").
 */
export function MapsRouteFields({
  waypoints, target, onSetWaypoint, onClearWaypoint, onAddStop, onRemoveStop, onReorder, onSwap,
  onPickOnMap, onFocusChange, onTyping,
}: {
  waypoints:  (LatLng | null)[]
  /** Index of the field the suggestions / map pick apply to (-1: none). */
  target:     number
  onSetWaypoint:   (index: number, lat: number, lng: number, label?: string) => void
  onClearWaypoint: (index: number) => void
  onAddStop:       () => void
  onRemoveStop:    (index: number) => void
  onReorder:       (from: number, to: number) => void
  onSwap:          () => void
  onPickOnMap:     (index: number) => void
  onFocusChange:   (index: number, focused: boolean) => void
  onTyping:        (typing: boolean) => void
}) {
  const { t } = useTranslation('maps')
  const [armed,    setArmed]    = useState<number | null>(null)   // grip held: the row becomes draggable
  const [dragging, setDragging] = useState<number | null>(null)
  const [over,     setOver]     = useState<number | null>(null)
  useEffect(() => {
    if (armed === null) return
    const up = () => setArmed(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [armed])
  const endDrag = () => { setDragging(null); setOver(null); setArmed(null) }

  const count = waypoints.length
  const value = (w: LatLng | null) => (w ? (w.label ?? `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`) : null)
  const placeholder = (i: number) =>
    i === 0 ? t('maps_route_from_placeholder', { defaultValue: 'Choisissez un point de départ ou cliquez sur la carte' })
    : i === count - 1 ? t('maps_route_to_placeholder', { defaultValue: 'Choisissez une destination' })
    : t('maps_route_stop', { defaultValue: 'Étape' })

  return (
    <div className="pl-4 pr-2 pt-1">
      <div className="flex items-stretch gap-1">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {waypoints.map((w, i) => {
            const stop = i > 0 && i < count - 1
            return (
              <div key={i}
                draggable={armed === i}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragging(i) }}
                onDragOver={e => { if (dragging !== null) { e.preventDefault(); setOver(i) } }}
                onDragLeave={() => setOver(o => (o === i ? null : o))}
                onDrop={e => { e.preventDefault(); if (dragging !== null && dragging !== i) onReorder(dragging, i); endDrag() }}
                onDragEnd={endDrag}
                className={`flex items-center gap-2 rounded-lg transition-opacity ${dragging === i ? 'opacity-40' : ''} ${
                  over === i && dragging !== i ? 'outline outline-2 outline-primary -outline-offset-2' : ''}`}>
                <Connector index={i} count={count} />
                <div className="flex-1 min-w-0">
                  <MapsAddressInput
                    size="lg"
                    value={value(w)}
                    placeholder={placeholder(i)}
                    autoFocus={i === 0 && !w}
                    leading={stop ? (
                      <span onMouseDown={() => setArmed(i)}
                        title={t('maps_route_drag_stop', { defaultValue: 'Glisser pour réordonner' })}
                        className="w-8 h-9 rounded-full flex items-center justify-center text-text-tertiary cursor-grab flex-shrink-0">
                        <GripVertical size={18} />
                      </span>
                    ) : undefined}
                    trailing={stop ? (
                      <button type="button" onClick={() => onRemoveStop(i)} {...hoverBg(BUTTON_HOVER)}
                        title={t('maps_route_remove_stop', { defaultValue: 'Retirer' })}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary flex-shrink-0">
                        <X size={18} />
                      </button>
                    ) : undefined}
                    onSelect={r => {
                      // "Tour Eiffel, Av. Gustave Eiffel, 75007 Paris": name then compact address.
                      const title = placeDetails(r).title, addr = formatAddress(r.address)
                      onSetWaypoint(i, parseFloat(r.lat), parseFloat(r.lon), addr && !addr.startsWith(title) ? `${title}, ${addr}` : title)
                    }}
                    onClear={() => onClearWaypoint(i)}
                    onFocusChange={f => onFocusChange(i, f)}
                    onTyping={onTyping}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="w-10 flex items-center justify-center flex-shrink-0 no-print">
          <button type="button" onClick={onSwap} {...hoverBg(BUTTON_HOVER)}
            title={t('maps_route_swap', { defaultValue: 'Inverser le départ et la destination' })}
            aria-label={t('maps_route_swap', { defaultValue: 'Inverser le départ et la destination' })}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-secondary">
            <ArrowUpDown size={20} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 pl-8 pt-1 no-print">
        {count < MAX_WAYPOINTS && (
          <button type="button" onClick={onAddStop} {...hoverBg(BUTTON_HOVER)}
            className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-full text-sm font-medium text-primary">
            <span className="w-7 h-7 rounded-full flex items-center justify-center bg-primary-light"><Plus size={16} /></span>
            {t('maps_route_add_destination', { defaultValue: 'Ajouter une destination' })}
          </button>
        )}
        {target >= 0 && (
          <button type="button" onClick={() => onPickOnMap(target)} {...hoverBg(BUTTON_HOVER)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium text-primary">
            <MapPin size={16} />
            {t('maps_route_pick_on_map', { defaultValue: 'Choisir sur la carte' })}
          </button>
        )}
      </div>
    </div>
  )
}
