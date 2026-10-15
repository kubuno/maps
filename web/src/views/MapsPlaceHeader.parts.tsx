/**
 * React part of `MapsPlaceHeader.kbview`: the @ui `Tabs` strip, which is prop-driven (a tabs array +
 * onChange) rather than the registry's list-based Tabs element, so it stays React. Rendered by a
 * `<ReactHost>`. (The star row reuses `Stars` from MapsPlaceReviews via another `<ReactHost>`.)
 */
import { Tabs, type TabDef } from '@ui'
import type { TFunction } from 'i18next'

export function PlaceTabs<T extends string>({ tabs, value, onChange, t }: {
  tabs:     TabDef<T>[]
  value:    T
  onChange: (t: T) => void
  t:        TFunction
}) {
  return <Tabs<T> tabs={tabs} value={value} onChange={onChange} variant="stretched" size="sm" t={t} className="mt-1" />
}
