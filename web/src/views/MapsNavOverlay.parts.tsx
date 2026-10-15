/**
 * The part of `MapsNavOverlay.kbview` still written in React: the maneuver glyph, chosen dynamically from
 * the step's `iconKey` (a set of Lucide icons). Rendered by a `<ReactHost>` with the key it reads as a prop.
 */
import {
  ArrowUp, ArrowUpRight, ArrowRight, ArrowUpLeft, ArrowLeft,
  CornerUpRight, CornerUpLeft, RotateCcw, RotateCw, Flag,
} from 'lucide-react'
import type { ReactNode } from 'react'

function icon(key: string, size = 30): ReactNode {
  switch (key) {
    case 'depart':       return <ArrowUp size={size} />
    case 'arrive':       return <Flag size={size} />
    case 'slight-right': return <ArrowUpRight size={size} />
    case 'right':        return <ArrowRight size={size} />
    case 'sharp-right':  return <CornerUpRight size={size} />
    case 'slight-left':  return <ArrowUpLeft size={size} />
    case 'left':         return <ArrowLeft size={size} />
    case 'sharp-left':   return <CornerUpLeft size={size} />
    case 'uturn':        return <RotateCcw size={size} />
    case 'roundabout':   return <RotateCw size={size} />
    default:             return <ArrowUp size={size} />
  }
}

export function ManeuverIcon({ iconKey }: { iconKey: string }) {
  return <>{icon(iconKey)}</>
}
