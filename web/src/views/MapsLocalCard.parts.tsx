/**
 * React part of `MapsLocalCard.kbview`: the current-weather glyph, picked dynamically from the weather
 * code (a Lucide component), so it has no .kbview element. Rendered by a `<ReactHost>`.
 */
import { weatherIcon } from '../services/weather'

export function WeatherIcon({ code }: { code: number }) {
  const Icon = weatherIcon(code)
  return Icon ? <Icon size={22} className="text-text-secondary" /> : null
}
