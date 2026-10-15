/**
 * React part of `MapsSettingsPage.kbview`: the traffic switch, since the registry has no `Toggle` element.
 * Rendered by a `<ReactHost>`.
 */
import { Toggle } from '@ui'

export function TrafficToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <Toggle checked={checked} onChange={onChange} />
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  )
}
