import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Navigation } from 'lucide-react'
import { api } from '@kubuno/sdk'
import { Spinner } from '@ui'

/**
 * Maps side panel — your saved places, one click from wherever you are.
 *
 * This is the narrowest of the side panels on purpose: a map is only useful here
 * when an address is already in mind. So it lists saved places and hands off to
 * the module (or to directions) rather than embedding a map that would be too
 * small to pan and too heavy to mount beside every other page.
 */
interface Place {
  id:       string
  name:     string
  address:  string | null
  lat:      number
  lng:      number
  category: string | null
}

export default function MapsMiniPanel() {
  const { t } = useTranslation('maps')
  const navigate = useNavigate()

  const { data: places = [], isLoading } = useQuery({
    queryKey: ['maps-mini-places'],
    queryFn:  () => api.get<{ places: Place[] }>('/maps/places').then(r => r.data.places),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3 pb-1 uppercase tracking-wide text-text-tertiary"
           style={{ fontSize: 'var(--kb-text-meta)' }}>
        {t('maps_places_title', { defaultValue: 'Mes lieux' })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : places.length === 0 ? (
          <p className="px-2 py-4 text-text-tertiary" style={{ fontSize: 'var(--kb-text-meta)' }}>
            {t('maps_places_empty', { defaultValue: 'Aucun lieu enregistré.' })}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {places.slice(0, 20).map(p => (
              <li key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-1">
                <button
                  type="button"
                  onClick={() => navigate(`/maps#place/${p.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MapPin size={15} className="flex-shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-primary" style={{ fontSize: 'var(--kb-text-body)' }}>
                      {p.name}
                    </span>
                    {p.address && (
                      <span className="block truncate text-text-tertiary" style={{ fontSize: 'var(--kb-text-meta)' }}>
                        {p.address}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  title={t('maps_directions', { defaultValue: 'Itinéraire' })}
                  aria-label={t('maps_directions', { defaultValue: 'Itinéraire' })}
                  onClick={() => navigate(`/maps#route/${p.lat},${p.lng}`)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary opacity-0
                             transition-opacity transition-colors hover:bg-surface-2 hover:text-text-primary
                             group-hover:opacity-100 group-focus-within:opacity-100
                             focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Navigation size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
