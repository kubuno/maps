/**
 * React parts of `MapsRouteResults.kbview`: the per-card travel-mode glyph and the per-step maneuver glyph,
 * both chosen dynamically (and one is a custom SVG), so they stay React. Rendered by `<ReactHost>`.
 */
import type { ReactNode } from 'react'
import {
  ArrowUp, ArrowUpRight, ArrowRight, ArrowUpLeft, ArrowLeft, CornerUpRight, CornerUpLeft,
  RotateCcw, RotateCw, Flag,
} from 'lucide-react'
import { modeIcon } from './MapsRouteModes.parts'
import type { RouteMode } from '../maps-app/useRouteModes'

/** Maneuver key → lucide icon (turn-by-turn list). */
export function maneuverIcon(key: string, size = 18): ReactNode {
  switch (key) {
    case 'arrive':       return <Flag size={size} />
    case 'slight-right': return <ArrowUpRight size={size} />
    case 'right':        return <ArrowRight size={size} />
    case 'sharp-right':  return <CornerUpRight size={size} />
    case 'slight-left':  return <ArrowUpLeft size={size} />
    case 'left':         return <ArrowLeft size={size} />
    case 'sharp-left':   return <CornerUpLeft size={size} />
    case 'uturn':        return <RotateCcw size={size} />
    case 'roundabout':   return <RotateCw size={size} />
    case 'depart': case 'straight':
    default:             return <ArrowUp size={size} />
  }
}

export function CardModeIcon({ mode }: { mode: RouteMode }) {
  return <>{modeIcon(mode, 24)}</>
}

export function StepIcon({ iconKey }: { iconKey: string }) {
  return <>{maneuverIcon(iconKey)}</>
}
