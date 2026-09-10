import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, TrainFront, Footprints, Bike, Plane, X } from 'lucide-react'
import { Tooltip } from '@ui'
import { DirectionsIcon } from './DirectionsIcon'
import { hoverBg, BUTTON_HOVER } from './MapsSearchDropdown'
import type { RouteMode } from './useRouteModes'

/** Icon of a travel mode (shared by the mode row and the result cards). */
export function modeIcon(mode: RouteMode, size = 22): ReactNode {
  switch (mode) {
    case 'recommended': return <DirectionsIcon size={size} />
    case 'driving':     return <Car size={size} />
    case 'transit':     return <TrainFront size={size} />
    case 'foot':        return <Footprints size={size} />
    case 'cycling':     return <Bike size={size} />
    case 'plane':       return <Plane size={size} />
  }
}

/** Localised label of a travel mode. */
export function useModeLabel(): (mode: RouteMode) => string {
  const { t } = useTranslation('maps')
  return (mode) => {
    switch (mode) {
      case 'recommended': return t('maps_route_mode_recommended', { defaultValue: 'Recommandé' })
      case 'driving':     return t('maps_route_mode_driving',     { defaultValue: 'Voiture' })
      case 'transit':     return t('maps_route_mode_transit',     { defaultValue: 'Transports en commun' })
      case 'foot':        return t('maps_route_mode_foot',        { defaultValue: 'À pied' })
      case 'cycling':     return t('maps_route_mode_cycling',     { defaultValue: 'Vélo' })
      case 'plane':       return t('maps_route_mode_plane',       { defaultValue: 'Avion' })
    }
  }
}

const ORDER: RouteMode[] = ['recommended', 'driving', 'transit', 'foot', 'cycling', 'plane']

/**
 * Mode row of the route panel: six 40 px icon buttons (active one on a light
 * primary pill) and the close cross at the far right. Public transport has no
 * data source in Kubuno: the button stays visible but inert, never faked.
 */
export function MapsRouteModes({ mode, setMode, onClose }: {
  mode:    RouteMode
  setMode: (m: RouteMode) => void
  onClose: () => void
}) {
  const { t } = useTranslation('maps')
  const label = useModeLabel()
  return (
    <div className="flex items-center gap-1 pl-4 pr-2 pt-3 pb-1 no-print">
      <div className="flex-1 flex items-center justify-center gap-3">
        {ORDER.map(m => {
          const active = m === mode
          const disabled = m === 'transit'
          const tip = disabled
            ? t('maps_route_mode_transit_unavailable', { defaultValue: 'Transports en commun : pas encore disponible' })
            : label(m)
          return (
            <Tooltip key={m} label={tip}>
              <button
                type="button"
                aria-label={tip}
                aria-pressed={active}
                aria-disabled={disabled || undefined}
                onClick={disabled ? undefined : () => setMode(m)}
                {...(active || disabled ? {} : hoverBg(BUTTON_HOVER))}
                className={`h-10 w-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  active ? 'bg-primary-light text-primary'
                  : disabled ? 'text-text-primary opacity-50 cursor-not-allowed'
                  : 'text-text-primary'}`}
              >
                {modeIcon(m)}
              </button>
            </Tooltip>
          )
        })}
      </div>
      <button type="button" onClick={onClose} {...hoverBg(BUTTON_HOVER)}
        title={t('maps_route_close', { defaultValue: "Fermer l'itinéraire" })}
        aria-label={t('maps_route_close', { defaultValue: "Fermer l'itinéraire" })}
        className="w-10 h-10 rounded-full flex items-center justify-center text-text-secondary flex-shrink-0">
        <X size={22} />
      </button>
    </div>
  )
}
