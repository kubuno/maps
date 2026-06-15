import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bookmark, Clock, Activity, Route, Smartphone, type LucideIcon } from 'lucide-react'
import { SidebarNavItem } from '@kubuno/sdk'
import { Slot } from '@kubuno/sdk'
import { useMapsUiStore, type MapsTab } from './mapsUiStore'

// Nav du module Maps rendue dans la sidebar de gauche du core (au lieu de l'ancien
// rail flottant). `collapsedBody: true` (register.ts) → ce corps est rendu AUSSI
// quand la sidebar est repliée.
//
// Particularité demandée : en mode REPLIÉ, on conserve le LIBELLÉ SOUS l'icône
// (disposition verticale, comme l'ancien rail) au lieu de l'icône seule du
// SidebarNavItem standard. En mode déplié : icône + libellé à côté (standard).
const NAV: { tab: MapsTab; tk: string; fallback: string; Icon: LucideIcon }[] = [
  { tab: 'places', tk: 'maps_tab_places', fallback: 'Lieux',      Icon: Bookmark },
  { tab: 'search', tk: 'maps_tab_search', fallback: 'Recherche',  Icon: Clock },
  { tab: 'gpx',    tk: 'maps_tab_gpx',    fallback: 'GPX',        Icon: Activity },
  { tab: 'route',  tk: 'maps_tab_route',  fallback: 'Itinéraire', Icon: Route },
]

// Bouton vertical (icône + libellé dessous) pour le mode replié — reprend le style
// de l'ancien rail flottant.
function RailItem({ icon, label, active, onClick }: {
  icon: ReactNode; label: string; active?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} title={label}
      className={`w-full flex flex-col items-center gap-1 py-2 rounded-lg transition-colors ${
        active ? 'bg-primary-light text-primary' : 'text-text-secondary hover:bg-surface-2'}`}>
      {icon}
      <span className="text-[10px] leading-tight text-center px-0.5 truncate max-w-full">{label}</span>
    </button>
  )
}

export default function MapsSidebarBody({ collapsed = false }: { collapsed?: boolean }) {
  const { t }  = useTranslation('maps')
  const tab    = useMapsUiStore(s => s.tab)
  const setTab = useMapsUiStore(s => s.setTab)

  const getAppLabel = t('maps_get_app', { defaultValue: "Obtenir l'appli" })

  const renderItem = (
    key: string, label: string, Icon: LucideIcon, active: boolean, onClick: () => void,
  ) => collapsed ? (
    <RailItem key={key} icon={<Icon className="w-5 h-5 flex-shrink-0" />} label={label} active={active} onClick={onClick} />
  ) : (
    <SidebarNavItem key={key} label={label} icon={<Icon className="w-4 h-4 flex-shrink-0" />} active={active} onClick={onClick} />
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <nav className={`flex-1 overflow-y-auto py-1 space-y-0.5 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {NAV.map(({ tab: tk2, tk, fallback, Icon }) =>
          renderItem(tk2, t(tk, { defaultValue: fallback }), Icon, tab === tk2, () => setTab(tk2)),
        )}
      </nav>

      {/* « Obtenir l'appli » — au bas de la sidebar, au-dessus du stockage. */}
      <div className={`pb-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {renderItem('get-app', getAppLabel, Smartphone, false, () => { /* lien store / QR à venir */ })}
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
