/**
 * React part of `MapsRouteSuggestions.kbview`: the per-row glyph, chosen by name from a small Lucide set
 * (no bindable `Icon.Name`). Rendered by a `<ReactHost>`.
 */
import { LocateFixed, Home, Briefcase, Clock } from 'lucide-react'

const ICONS = { LocateFixed, Home, Briefcase, Clock }

export function SuggIcon({ name }: { name: keyof typeof ICONS }) {
  const Icon = ICONS[name]
  return <Icon size={20} />
}
