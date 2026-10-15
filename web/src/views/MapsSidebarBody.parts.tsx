/**
 * React part of `MapsSidebarBody.kbview`: the collapsed-rail glyph, chosen by Lucide name. Rendered by a
 * `<ReactHost>` (the expanded rows use the <SidebarNavItem> control, which takes an icon name directly).
 */
import type { ComponentType } from 'react'
import * as Lucide from 'lucide-react'

export function NavIcon({ name }: { name: string }) {
  const Icon = (Lucide as unknown as Record<string, ComponentType<{ className?: string }>>)[name]
  return Icon ? <Icon className="w-5 h-5 flex-shrink-0" /> : null
}
