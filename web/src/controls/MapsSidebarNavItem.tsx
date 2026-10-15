// MapsSidebarNavItem — the native element behind the `.kbview` <SidebarNavItem> project control
// (src/kbview-controls.json). Wraps the host `SidebarNavItem` (@kubuno/sdk) so a module's sidebar row can be
// authored declaratively; the icon is passed by Lucide name.
import type { ComponentType, ReactNode } from 'react'
import * as Lucide from 'lucide-react'
import { SidebarNavItem } from '@kubuno/sdk'

function glyph(name?: string): ReactNode {
  if (!name) return null
  const Icon = (Lucide as unknown as Record<string, ComponentType<{ className?: string }>>)[name]
  return Icon ? <Icon className="w-4 h-4 flex-shrink-0" /> : null
}

export interface MapsSidebarNavItemProps {
  label?:     string
  iconName?:  string
  active?:    boolean
  collapsed?: boolean
  to?:        string
  href?:      string
  badge?:     number
  onClick?:   () => void
}

export function MapsSidebarNavItem(p: MapsSidebarNavItemProps) {
  return (
    <SidebarNavItem
      label={p.label ?? ''}
      icon={glyph(p.iconName)}
      active={p.active}
      collapsed={p.collapsed}
      to={p.to}
      href={p.href}
      badge={p.badge}
      onClick={p.onClick}
    />
  )
}
