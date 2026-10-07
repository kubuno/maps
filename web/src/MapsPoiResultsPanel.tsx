import { useTranslation } from 'react-i18next'
import { X, RefreshCw } from 'lucide-react'
import { haversineM } from './mapMarkers'
import type { Poi } from './poi'

// Explore-results panel (POI by category): the transient list shown in the left
// rail after tapping a category chip.
export function PoiResultsPanel({
  title, emoji, pois, center, loading, error, onSelect, onClose,
}: {
  title:    string
  emoji:    string
  pois:     Poi[]
  center:   { lat: number; lng: number } | null
  loading:  boolean
  error:    string | null
  onSelect: (p: Poi) => void
  onClose:  () => void
}) {
  const { t } = useTranslation('maps')
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)
  return (
    <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-lg" aria-hidden>{emoji}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary leading-tight truncate">{title}</h2>
          {!loading && !error && (
            <p className="text-[11px] text-text-tertiary">
              {t('maps_poi_count', { count: pois.length, defaultValue: `${pois.length} lieu(x)` })}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary flex-shrink-0">
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-text-tertiary">
            <RefreshCw size={13} className="animate-spin" /> {t('maps_calculating', { defaultValue: 'Recherche…' })}
          </div>
        )}
        {!loading && error && <p className="px-4 py-6 text-xs text-text-tertiary">{error}</p>}
        {!loading && !error && pois.map(p => {
          const dist = center ? haversineM(center.lat, center.lng, p.lat, p.lng) : null
          return (
            <button
              key={`${p.osm_type}-${p.osm_id}`}
              onClick={() => onSelect(p)}
              className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left border-t border-border first:border-t-0 hover:bg-surface-1 transition-colors"
            >
              <span className="text-base mt-0.5 flex-shrink-0" aria-hidden>{p.icon || '📍'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary leading-snug truncate">
                  {p.name || t('maps_poi_unnamed', { defaultValue: 'Lieu sans nom' })}
                </p>
                <p className="text-[11px] text-text-tertiary capitalize truncate">
                  {(p.tags?.cuisine || p.tags?.amenity || p.tags?.shop || p.tags?.tourism || p.category || '').replace(/_/g, ' ')}
                </p>
              </div>
              {dist !== null && <span className="text-[11px] text-text-tertiary flex-shrink-0 mt-0.5">{fmt(dist)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

