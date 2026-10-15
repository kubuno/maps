// MapsMenuDropdown — the native element behind the `.kbview` <MenuDropdown> project control
// (src/kbview-controls.json). Wraps @ui `useMenuDropdown` + `MenuDropdown`: the single child is the trigger,
// `Items` is a plain data array built in the code-behind (no JSX needed there — icons are passed by Lucide
// name). Clicking the trigger opens the positioned popup; picking an item runs its onClick and closes.
import type { ComponentType, ReactNode } from 'react'
import * as Lucide from 'lucide-react'
import { MenuDropdown, useMenuDropdown, type MenuItem } from '@ui'

export interface MenuItemData {
  separator?: boolean
  label?:     string
  iconName?:  string
  checked?:   boolean
  danger?:    boolean
  disabled?:  boolean
  onClick?:   () => void
}

function glyph(name?: string): ReactNode {
  if (!name) return undefined
  const Icon = (Lucide as unknown as Record<string, ComponentType<{ size?: number }>>)[name]
  return Icon ? <Icon size={15} /> : undefined
}

export interface MapsMenuDropdownProps {
  items?:     MenuItemData[]
  minWidth?:  number
  className?: string
  children?:  ReactNode
}

export function MapsMenuDropdown({ items, minWidth, className, children }: MapsMenuDropdownProps) {
  const menu = useMenuDropdown()
  const menuItems: MenuItem[] = (items ?? []).map(it =>
    it.separator
      ? { type: 'separator' }
      : { type: 'action', label: it.label ?? '', checked: it.checked, danger: it.danger, disabled: it.disabled, icon: glyph(it.iconName), onClick: () => { it.onClick?.(); menu.close() } },
  )
  return (
    <>
      <div className={className} onClick={e => menu.open(e)}>{children}</div>
      {menu.isOpen && menu.pos && <MenuDropdown items={menuItems} pos={menu.pos} onClose={menu.close} minWidth={minWidth} />}
    </>
  )
}
