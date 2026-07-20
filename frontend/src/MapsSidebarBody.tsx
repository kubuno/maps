import { useEffect, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bookmark, Clock, Activity, Route, Ruler, Smartphone, type LucideIcon } from 'lucide-react'
import { SidebarNavItem } from '@kubuno/sdk'
import { Slot } from '@kubuno/sdk'
import { useMapsUiStore, type MapsTab } from './mapsUiStore'
import { hashTo, fromHash } from './hashRoute'

// Nav du module Maps rendue dans la sidebar de gauche du core (au lieu de l'ancien
// rail flottant). `collapsedBody: true` (register.ts) → ce corps est rendu AUSSI
// quand la sidebar est repliée.
//
// Particularité demandée : en mode REPLIÉ, on conserve le LIBELLÉ SOUS l'icône
// (disposition verticale, comme l'ancien rail) au lieu de l'icône seule du
// SidebarNavItem standard. En mode déplié : icône + libellé à côté (standard).
//
// Every clickable element here is an <a> carrying a real href. The panel tabs
// have no route of their own, so they are addressable through the URL hash
// (`/maps/#tab/<id>`, cf. hashRoute.ts) and the active tab is read back from
// `useLocation().hash` — direct links and the Back button therefore work.
const NAV: { tab: MapsTab; tk: string; fallback: string; Icon: LucideIcon }[] = [
  { tab: 'places', tk: 'maps_tab_places', fallback: 'Lieux',      Icon: Bookmark },
  { tab: 'search', tk: 'maps_tab_search', fallback: 'Recherche',  Icon: Clock },
  { tab: 'gpx',    tk: 'maps_tab_gpx',    fallback: 'GPX',        Icon: Activity },
  { tab: 'route',  tk: 'maps_tab_route',  fallback: 'Itinéraire', Icon: Route },
  { tab: 'sketch', tk: 'maps_tab_sketch', fallback: 'Croquis',    Icon: Ruler },
]

const TABS = NAV.map(n => n.tab) as string[]

/**
 * Hover background driven from JS instead of a `hover:bg-*` utility.
 *
 * A module bundle ships its own Tailwind build into the `kubuno-module` cascade
 * layer, which loses the race against the host's `utilities` layer: inside the
 * host sidebar, `hover:bg-*` coming from a module simply never paints (the
 * computed background stays transparent). Static background classes still win,
 * so only the hover variants have to be replaced. An inline style is immune to
 * the layer race. Same approach as the core's SidebarNavItem / LeftRail.
 *
 * Clearing the inline value on mouse leave (empty string, not 'transparent')
 * hands the element back to its static class — an active item keeps its
 * `bg-primary-light`.
 */
const hoverBg = (color: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})

/**
 * Row hover tint. Same value as the core's SidebarNavItem so this module's rows
 * highlight exactly like mail's — the left panel must feel like ONE sidebar.
 */
const ROW_HOVER = 'color-mix(in srgb, var(--color-primary) 12%, white)'


// Élément vertical (icône + libellé dessous) pour le mode replié — reprend le style
// de l'ancien rail flottant. Toujours une <a> : `to` → vrai lien, sinon ancre
// d'action ('#') qui ne pousse rien dans l'URL.
function RailItem({ icon, label, active, to, onClick }: {
  icon: ReactNode; label: string; active?: boolean; to?: string; onClick?: () => void
}) {
  const cls = `w-full flex items-center flex-col gap-1 py-2 rounded-lg transition-colors
    cursor-pointer no-underline outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active ? 'bg-primary-light text-primary' : 'text-text-secondary'}`
  const hover = active ? {} : hoverBg(ROW_HOVER)
  const content = (
    <>
      {icon}
      <span className="text-[10px] leading-tight text-center px-0.5 truncate max-w-full">{label}</span>
    </>
  )
  if (to != null) {
    return (
      <RouterLink to={to} title={label} aria-label={label}
        aria-current={active ? 'page' : undefined} className={cls} {...hover}>
        {content}
      </RouterLink>
    )
  }
  return (
    <a
      href="#"
      role="button"
      title={label}
      aria-label={label}
      onClick={e => { e.preventDefault(); onClick?.() }}
      // Enter is handled natively by the anchor; only Space needs wiring.
      onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); onClick?.() } }}
      className={cls}
      {...hover}
    >
      {content}
    </a>
  )
}

export default function MapsSidebarBody({ collapsed = false }: { collapsed?: boolean }) {
  const { t }  = useTranslation('maps')
  const tab    = useMapsUiStore(s => s.tab)
  const setTab = useMapsUiStore(s => s.setTab)
  const { hash } = useLocation()

  // The hash drives the panel: opening `/maps/#tab/route` directly, or pressing
  // Back after a tab change, applies the tab to the store the page reads from.
  useEffect(() => {
    const parsed = fromHash(hash)
    if (parsed?.kind === 'tab' && TABS.includes(parsed.id)) setTab(parsed.id as MapsTab)
  }, [hash, setTab])

  const getAppLabel = t('maps_get_app', { defaultValue: "Obtenir l'appli" })

  const renderItem = (
    key: string, label: string, Icon: LucideIcon, active: boolean,
    link: { to: string } | { onClick: () => void },
  ) => collapsed ? (
    <RailItem key={key} icon={<Icon className="w-5 h-5 flex-shrink-0" />} label={label} active={active} {...link} />
  ) : (
    <SidebarNavItem key={key} label={label} icon={<Icon className="w-4 h-4 flex-shrink-0" />} active={active} {...link} />
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <nav className={`flex-1 overflow-y-auto py-1 space-y-0.5 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {NAV.map(({ tab: tk2, tk, fallback, Icon }) =>
          renderItem(tk2, t(tk, { defaultValue: fallback }), Icon, tab === tk2, { to: hashTo('tab', tk2) }),
        )}
      </nav>

      {/* « Obtenir l'appli » — au bas de la sidebar, au-dessus du stockage. */}
      <div className={`pb-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {renderItem('get-app', getAppLabel, Smartphone, false, { onClick: () => { /* lien store / QR à venir */ } })}
      </div>

      {/* Jauge de stockage (slots remplis par les modules — ex. Files) — masquée
          en mode replié, comme la nav par défaut du core. */}
      {!collapsed && (
        <>
          <Slot name="sidebar-footer" />
          <Slot name="sidebar-storage" />
        </>
      )}
    </div>
  )
}
