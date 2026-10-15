/**
 * Code-behind of `MapsSidebarBody.kbview` (converted from `MapsSidebarBody.tsx`).
 *
 * The Maps nav rendered in the core's left sidebar. Collapsed mode keeps the label UNDER the icon (vertical
 * rail) rather than the icon-only standard; expanded mode is the standard row. Tabs have no route of their
 * own, so they are addressed through the URL hash (`/maps/#tab/<id>`) and the active tab is read from it.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsSidebarBody.kbview'
import * as __parts from './MapsSidebarBody.parts.tsx'
import { useMapsUiStore, type MapsTab } from '../model/mapsUiStore'
import { hashTo, fromHash } from '../services/hashRoute'

const NAV: { tab: MapsTab; tk: string; fallback: string; iconName: string }[] = [
  { tab: 'places', tk: 'maps_tab_places', fallback: 'Lieux',      iconName: 'Bookmark' },
  { tab: 'search', tk: 'maps_tab_search', fallback: 'Recherche',  iconName: 'Clock' },
  { tab: 'gpx',    tk: 'maps_tab_gpx',    fallback: 'GPX',        iconName: 'Activity' },
  { tab: 'route',  tk: 'maps_tab_route',  fallback: 'Itinéraire', iconName: 'Route' },
  { tab: 'sketch', tk: 'maps_tab_sketch', fallback: 'Croquis',    iconName: 'Ruler' },
]
const TABS = NAV.map(n => n.tab) as string[]

export interface MapsSidebarBodyProps { collapsed?: boolean }

export class MapsSidebarBody extends ViewBase {
  tr!: MapsSidebarBodyStores['t']
  tab!: MapsTab

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  useHooks() {
    const tab = useMapsUiStore(s => s.tab)
    const setTab = useMapsUiStore(s => s.setTab)
    const { hash } = useLocation()
    // The hash drives the panel: opening `/maps/#tab/route` directly, or Back after a tab change, applies it.
    useEffect(() => {
      const parsed = fromHash(hash)
      if (parsed?.kind === 'tab' && TABS.includes(parsed.id)) setTab(parsed.id as MapsTab)
    }, [hash, setTab])
    this.publish({ tab })
    return { tab }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, nav: useNavigate() })
    this.useHooks()
  }

  nav!: ReturnType<typeof useNavigate>

  get collapsed() { return !!this.props.collapsed }
  get expanded() { return !this.props.collapsed }
  get NavIcon() { return __parts.NavIcon }

  get nav_class() { return `flex-1 overflow-y-auto py-1 space-y-0.5 ${this.collapsed ? 'px-1.5' : 'px-3'}` }
  get getapp_wrap_class() { return `pb-1 ${this.collapsed ? 'px-1.5' : 'px-3'}` }
  get get_app_label() { return this.tr('maps_get_app', { defaultValue: "Obtenir l'appli" }) }
  get getapp_icon_props() { return this.memo('getapp_icon_props', [], () => ({ name: 'Smartphone' })) }
  get getapp_rail_class() { return 'w-full flex items-center flex-col gap-1 py-2 rounded-lg transition-colors cursor-pointer text-text-secondary hover:bg-surface-2' }

  get rows_nav() {
    return this.memo('rows_nav', [this.tab, this.tr], () =>
      NAV.map(n => {
        const active = this.tab === n.tab
        return {
          key: n.tab,
          tab: n.tab,
          label: this.tr(n.tk, { defaultValue: n.fallback }),
          iconName: n.iconName,
          icon_props: { name: n.iconName },
          active,
          to: hashTo('tab', n.tab),
          rail_class: `w-full flex items-center flex-col gap-1 py-2 rounded-lg transition-colors cursor-pointer ${active ? 'bg-primary-light text-primary' : 'text-text-secondary hover:bg-surface-2'}`,
        }
      }),
    )
  }

  nav_to(_sender: unknown, args: MouseEventArgs) {
    const { to } = (args as MouseEventArgs & { row: { to: string } }).row
    this.nav(to)
  }

  get_app(_sender: unknown, _args: MouseEventArgs) {
    // Store / QR link to come.
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsSidebarBodyStores = ReturnType<MapsSidebarBody['useStores']>

export default MapsSidebarBody.component()
