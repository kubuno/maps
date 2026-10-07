/**
 * Rich card rendering maps envelopes (`maps.place` / `maps.route` / `maps.view`)
 * inside CONSUMER modules (chat, notes…). Registered on the `core.data-card`
 * extension point from `entry.ts`, so consumers resolve it dynamically and never
 * import maps' code — when maps is not installed they fall back to a generic
 * JSON card.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MapPin, Navigation, ExternalLink } from 'lucide-react'
import MiniMap, { type MapMarker } from './MiniMap'
import { fmtDistance, fmtDurationShort } from './routing'
import type { DataCardProps, MapsPlaceData, MapsRouteData, MapsViewData } from './kubunoData'

export default function MapsDataCard({ envelope }: DataCardProps) {
  const { t } = useTranslation('maps')
  const navigate = useNavigate()

  const { markers, subtitle, Icon } = useMemo(() => {
    if (envelope.type === 'maps.route') {
      const d = envelope.data as MapsRouteData
      const wps = Array.isArray(d.waypoints) ? d.waypoints : []
      return {
        Icon: Navigation,
        markers: wps.map((w, i) => ({
          lat: w.lat, lng: w.lng, label: w.label,
          color: i === 0 ? '#1e8e3e' : i === wps.length - 1 ? '#d93025' : '#1a73e8',
        })) as MapMarker[],
        subtitle: `${fmtDistance(d.distance)} · ${fmtDurationShort(d.duration)}`,
      }
    }
    const d = envelope.data as MapsPlaceData & MapsViewData
    const label = envelope.title ?? `${d.lat}, ${d.lng}`
    return {
      Icon: MapPin,
      markers: [{ lat: d.lat, lng: d.lng, label }] as MapMarker[],
      subtitle: envelope.type === 'maps.view'
        ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`
        : (d.display_name && d.display_name !== d.name ? d.display_name : `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`),
    }
  }, [envelope])

  const open = () => { if (envelope.href) navigate(envelope.href) }

  return (
    <div
      className="w-72 max-w-full rounded-xl border border-border bg-surface-0 overflow-hidden cursor-pointer hover:border-strong transition-colors"
      onClick={open}
      role="button"
      title={t('maps_open_in_maps', { defaultValue: 'Ouvrir dans Maps' })}
    >
      {/* Static pointer events on the preview: the card itself is the click target. */}
      <div className="pointer-events-none">
        <MiniMap markers={markers} height={140} />
      </div>
      <div className="px-3 py-2 flex items-start gap-2">
        <Icon size={15} className="text-primary mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text-primary truncate">{envelope.title}</p>
          {subtitle && <p className="text-[11px] text-text-secondary truncate">{subtitle}</p>}
        </div>
        <ExternalLink size={13} className="text-text-tertiary mt-0.5 flex-shrink-0" />
      </div>
    </div>
  )
}
