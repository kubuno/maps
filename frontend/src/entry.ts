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
  useSidebarStore,
  useToolbarStore,
  SDK_VERSION,
} from '@kubuno/sdk'
import './index.css'
import './i18n'
import MapsLogo from './MapsLogo'
import MapsSidebarBody from './MapsSidebarBody'

export const sdkVersion = SDK_VERSION

export function register() {
  FaviconRegistry.register('maps', '/maps-logo.svg')

  WaffleAppRegistry.register('maps', 'Maps', [
    { id: 'maps', label: 'Maps', Icon: MapsLogo, path: '/maps' },
  ])

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

  // Routes
  const MapsPage = lazy(() => import('./MapsPage'))

  RouteRegistry.register('maps', MapsPage)
}
