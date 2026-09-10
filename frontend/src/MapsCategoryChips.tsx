// Category chips row (top of the map, right of the search bar): one pill per
// POI category, in priority order (see POI_CHIPS). Only the chips that fit in
// the container are shown; the rest fold into a « Plus » chip that opens a
// MenuDropdown and always stays visible inside the container (nothing wraps,
// nothing is pushed under the header actions).

import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, RefreshCw, X } from 'lucide-react'
import { MenuDropdown, useMenuDropdown, type MenuItem } from '@ui'
import type { PoiChip } from './poi'

interface Props {
  chips:     PoiChip[]
  /** Key of the chip whose search is currently displayed (null: none). */
  activeKey: string | null
  /** Number of POIs found for the active chip. */
  count:     number
  loading:   boolean
  /** Error / empty message for the active search (null: none). */
  error?:    string | null
  onSelect:  (chip: PoiChip) => void
}

const GAP = 8                    // px between chips (matches `gap-2`)
const MORE_WIDTH_FALLBACK = 96   // estimated « Plus » chip width before first measure

// Tailwind `hover:` utilities live in the `kubuno-module` layer and may lose
// against host rules, so the hover tint is applied inline (same workaround as
// MapsSidebarBody).
const CHIP_HOVER = 'var(--kb-sidebar-hover, #f1f3f4)'
const hoverBg = (color: string) => ({
  onMouseEnter: (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})

const CHIP_BASE = 'flex items-center gap-2 h-10 px-4 rounded-full shadow-md text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors cursor-pointer select-none'
const CHIP_IDLE = 'bg-surface-0 text-text-primary'
const CHIP_ON   = 'bg-primary-light text-primary'

export function MapsCategoryChips({ chips, activeKey, count, loading, error, onSelect }: Props) {
  const { t } = useTranslation()
  const rowRef   = useRef<HTMLDivElement>(null)
  const moreRef  = useRef<HTMLButtonElement>(null)
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())
  const widths   = useRef(new Map<string, number>())   // measured chip widths (stable per label)
  const [visibleCount, setVisibleCount] = useState(chips.length)
  const menu = useMenuDropdown()

  // Measure chips and decide how many secondary chips fit. All chips are
  // rendered on the first pass so every width gets cached; afterwards hidden
  // chips reuse their cached width.
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const compute = () => {
      for (const [k, el] of chipRefs.current) {
        if (el.isConnected && el.offsetWidth > 0) widths.current.set(k, el.offsetWidth)
      }
      const moreW = moreRef.current?.offsetWidth || MORE_WIDTH_FALLBACK
      const avail = row.clientWidth - 8    // minus the horizontal padding (px-1)
      const w = (c: PoiChip) => widths.current.get(c.key) ?? 120
      // Total width if every chip is shown.
      let total = 0
      chips.forEach((c, i) => { total += w(c) + (i > 0 ? GAP : 0) })
      if (total <= avail) { setVisibleCount(chips.length); return }
      // Otherwise keep as many chips as fit next to the « Plus » chip (at least
      // one, so the row never collapses to the overflow menu alone).
      let used = moreW
      let n = 0
      for (const c of chips) {
        const next = used + w(c) + GAP
        if (next > avail) break
        used = next; n++
      }
      setVisibleCount(Math.min(chips.length, Math.max(1, n)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [chips])

  const visible  = chips.slice(0, visibleCount)
  const overflow = chips.slice(visibleCount)
  const activeChip = activeKey ? chips.find(c => c.key === activeKey) ?? null : null
  const activeInOverflow = !!activeChip && overflow.includes(activeChip)

  const label = (c: PoiChip) => t(c.labelKey, { defaultValue: c.fallback })

  const menuItems: MenuItem[] = overflow.map(c => {
    const Icon = c.icon
    return {
      type: 'action' as const,
      icon: <Icon size={15} />,
      label: label(c),
      checked: c.key === activeKey,
      onClick: () => { onSelect(c); menu.close() },
    }
  })

  const moreLabel = t('maps_cat_more', { defaultValue: 'Plus' })
  const ActiveIcon = activeInOverflow && activeChip ? activeChip.icon : null

  return (
    <>
      {/* Padding keeps the pill shadows inside the clipped box. */}
      <div ref={rowRef} className="flex gap-2 w-full overflow-hidden px-1 pt-1 pb-3">
        {visible.map(c => {
          const active = c.key === activeKey
          const Icon = c.icon
          return (
            <button key={c.key} type="button"
              ref={el => { if (el) chipRefs.current.set(c.key, el); else chipRefs.current.delete(c.key) }}
              onClick={() => onSelect(c)}
              aria-pressed={active}
              className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_IDLE}`}
              {...(active ? {} : hoverBg(CHIP_HOVER))}>
              <Icon size={18} strokeWidth={2} aria-hidden />
              {label(c)}
              {active && loading && <RefreshCw size={13} className="animate-spin" />}
              {active && !loading && <X size={14} className="opacity-80" />}
            </button>
          )
        })}
        {overflow.length > 0 && (
          <button ref={moreRef} type="button"
            onClick={e => {
              // A click on the ✕ of an overflowed active chip clears the search;
              // any other click opens the overflow menu.
              if (activeInOverflow && activeChip && (e.target as HTMLElement).closest('[data-clear]')) {
                onSelect(activeChip); return
              }
              if (menu.isOpen) menu.close(); else menu.open(e)
            }}
            aria-haspopup="menu" aria-expanded={menu.isOpen}
            className={`${CHIP_BASE} ${activeInOverflow || menu.isOpen ? CHIP_ON : CHIP_IDLE}`}
            {...(activeInOverflow || menu.isOpen ? {} : hoverBg(CHIP_HOVER))}>
            {ActiveIcon && <ActiveIcon size={18} strokeWidth={2} aria-hidden />}
            {activeInOverflow && activeChip ? label(activeChip) : moreLabel}
            {activeInOverflow && loading && <RefreshCw size={13} className="animate-spin" />}
            {activeInOverflow && !loading && <span data-clear className="flex"><X size={14} className="opacity-80" /></span>}
            {!activeInOverflow && <ChevronDown size={14} className="opacity-70 -ml-1" />}
          </button>
        )}
      </div>
      {menu.isOpen && menu.pos && (
        <MenuDropdown items={menuItems} pos={menu.pos} onClose={menu.close} minWidth={220} />
      )}
      {/* Search state: result count or error/empty message */}
      {activeKey && !loading && (
        <div className="flex items-center gap-2 px-3 h-7 rounded-full bg-surface-0 shadow-sm text-xs text-text-secondary">
          {error
            ? <span className="text-text-tertiary">{error}</span>
            : <span>{t('maps_poi_count', { count, defaultValue: `${count} lieu(x)` })}</span>}
        </div>
      )}
    </>
  )
}
