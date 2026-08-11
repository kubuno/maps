/**
 * Point d'entrée du bundle MODULE maps (la page /maps), chargé à l'exécution.
 *
 * Buildé séparément via `vite.module.config.ts` : tous les specifiers partagés
 * (`@kubuno/sdk`, `@ui`, react, maplibre-gl externalisé ? non — maplibre reste
 * bundlé localement) sont résolus au runtime par l'import map du host. Le host
 * importe ce fichier puis appelle `register()` ; `sdkVersion` permet de rejeter
 * proprement une incompatibilité de contrat.
 */
import { lazy } from 'react'
import {
  RouteRegistry,
  WaffleAppRegistry,
  FaviconRegistry,
  ModuleSettingsRegistry,
  ModuleServiceRegistry,
  useSidebarStore,
  useToolbarStore,
  useRightPanelStore,
  SDK_VERSION,
} from '@kubuno/sdk'
import './index.css'
import './i18n'
import MapsLogo from './MapsLogo'
import MapsMiniPanel from './MapsMiniPanel'
import MapsSidebarBody from './MapsSidebarBody'
import { geoipLookup } from './geoipService'
import MiniMap from './MiniMap'
import MapsDataCard from './MapsDataCard'
import { registerDataCardRenderer } from './kubunoData'

export const sdkVersion = SDK_VERSION

export function register() {
  FaviconRegistry.register('maps', '/maps-logo.svg')

  // Services maps offre aux autres modules (présents uniquement quand maps est
  // installé+actif → les consommateurs dégradent proprement si absent).
  ModuleServiceRegistry.publish('maps', {
    geoip: (ip: string) => geoipLookup(ip),
    geoipCountry: (ip: string) => geoipLookup(ip).then(r => r.country),
    // Reusable map component, rendered by maps: a consumer gets it via
    // ModuleServiceRegistry.get('maps','MiniMap') and renders <MiniMap markers/>.
    MiniMap,
  })

  // Rich card for maps JSON envelopes copied to the clipboard (`maps.place`…):
  // consumer modules (chat…) resolve it through the shared extension point.
  registerDataCardRenderer('maps', {
    types: ['maps.place', 'maps.route', 'maps.view'],
    Component: MapsDataCard,
  })

  WaffleAppRegistry.register('maps', 'Maps', [
    { id: 'maps', label: 'Maps', Icon: MapsLogo, path: '/maps' },
  ])

  // The header gear button opens the per-user Maps settings while in /maps.
  ModuleSettingsRegistry.register('maps')

  useSidebarStore.getState().register({
    moduleId:      'maps',
    routePrefix:   '/maps',
    SidebarBody:   MapsSidebarBody,
    collapsedBody: true,
  })

  useToolbarStore.getState().register({
    moduleId:    'maps',
    routePrefix: '/maps',
    noPadding:   true,
  })

  // The settings page has its own breadcrumb header; no module toolbar there.
  useToolbarStore.getState().register({
    moduleId:    'maps-settings',
    routePrefix: '/maps/settings',
  })

  // Side panel: saved places, reachable from any module.
  useRightPanelStore.getState().registerEntry({
    moduleId:       'maps',
    icon:           MapsLogo,
    label:          'Maps',
    panelComponent: MapsMiniPanel,
    openPath:       '/maps',
  })

  // Routes
  const MapsPage          = lazy(() => import('./MapsPage'))
  const MapsSettingsPage  = lazy(() => import('./MapsSettingsPage'))
  const MapsPublicSketch  = lazy(() => import('./MapsPublicSketch'))

  RouteRegistry.register('maps', MapsPage)
  RouteRegistry.register('maps/settings', MapsSettingsPage)
  // Vue publique (anonyme) d'un croquis partagé — hors shell.
  RouteRegistry.registerPublic('maps/s/:token', MapsPublicSketch)
}
