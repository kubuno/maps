/**
 * React parts of `MapsRouteModes.kbview`: the travel-mode glyphs (one is a custom SVG, `DirectionsIcon`,
 * not a Lucide icon, so the set stays React) plus the shared `modeIcon` / `useModeLabel` helpers that other
 * screens (`MapsRouteResults`) import. The code-behind re-exports the two helpers for those consumers.
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, TrainFront, Footprints, Bike, Plane } from 'lucide-react'
import { DirectionsIcon } from '../pages/DirectionsIcon'
import type { RouteMode } from '../maps-app/useRouteModes'

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

/** The glyph for one Repeater row, rendered by a `<ReactHost>`. */
export function ModeIcon({ mode }: { mode: RouteMode }) {
  return <>{modeIcon(mode)}</>
}
