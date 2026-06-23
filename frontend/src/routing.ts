// Advanced routing helpers: parse OSRM responses into selectable alternatives
// with turn-by-turn maneuvers, and build human instructions (FR/EN) + icon keys
// from the maneuver type/modifier. OSRM only returns structured maneuvers
// (no localized text), so the wording is built here.

export interface LatLng { lat: number; lng: number; label?: string }

export type RouteGeometry = { type: string; coordinates: [number, number][] }

export interface RouteStep {
  text:     string                 // localized instruction
  iconKey:  string                 // key → lucide icon (resolved in the panel)
  distance: number                 // meters for this step
  duration: number                 // seconds
  name:     string                 // road name (may be empty)
  location: [number, number]       // [lng, lat]
}

export interface RouteResult {
  distance: number
  duration: number
  geometry: RouteGeometry | null
  steps:    RouteStep[]
}

// Raw OSRM shapes (only the fields we read).
interface OsrmManeuver { type: string; modifier?: string; location: [number, number]; exit?: number }
interface OsrmStep { maneuver: OsrmManeuver; name?: string; distance: number; duration: number }
interface OsrmLeg { steps?: OsrmStep[] }
interface OsrmRoute { distance: number; duration: number; geometry?: RouteGeometry; legs?: OsrmLeg[] }

// Maps an OSRM maneuver (type + modifier) to an icon key understood by the panel.
function iconKeyFor(m: OsrmManeuver): string {
  if (m.type === 'depart')  return 'depart'
  if (m.type === 'arrive')  return 'arrive'
  if (m.type === 'roundabout' || m.type === 'rotary'
    || m.type === 'roundabout turn' || m.type === 'exit roundabout' || m.type === 'exit rotary') return 'roundabout'
  switch (m.modifier) {
    case 'uturn':        return 'uturn'
    case 'sharp right':  return 'sharp-right'
    case 'right':        return 'right'
    case 'slight right': return 'slight-right'
    case 'sharp left':   return 'sharp-left'
    case 'left':         return 'left'
    case 'slight left':  return 'slight-left'
    case 'straight':
    default:             return 'straight'
  }
}

// FR/EN wording. Kept compact; covers the common OSRM maneuver vocabulary.
const TURN: Record<string, { fr: string; en: string }> = {
  'uturn':        { fr: 'Faites demi-tour',           en: 'Make a U-turn' },
  'sharp right':  { fr: 'Tournez fortement à droite', en: 'Turn sharply right' },
  'right':        { fr: 'Tournez à droite',           en: 'Turn right' },
  'slight right': { fr: 'Serrez à droite',            en: 'Keep right' },
  'sharp left':   { fr: 'Tournez fortement à gauche', en: 'Turn sharply left' },
  'left':         { fr: 'Tournez à gauche',           en: 'Turn left' },
  'slight left':  { fr: 'Serrez à gauche',            en: 'Keep left' },
  'straight':     { fr: 'Continuez tout droit',       en: 'Continue straight' },
}

function pick(lang: string, fr: string, en: string): string {
  return lang.startsWith('fr') ? fr : en
}

/** Builds a localized instruction string for one OSRM step. */
function maneuverText(m: OsrmManeuver, name: string, lang: string): string {
  const on = name ? pick(lang, ` sur ${name}`, ` onto ${name}`) : ''
  switch (m.type) {
    case 'depart':
      return name
        ? pick(lang, `Prenez ${name}`, `Head out on ${name}`)
        : pick(lang, 'Départ', 'Depart')
    case 'arrive':
      return pick(lang, 'Arrivée à destination', 'Arrive at your destination')
    case 'roundabout':
    case 'rotary': {
      const ex = m.exit ? pick(lang, ` et prenez la ${m.exit}ᵉ sortie`, ` and take exit ${m.exit}`) : ''
      return pick(lang, `Au rond-point${ex}`, `At the roundabout${ex}`) + on
    }
    case 'merge':
      return pick(lang, `Insérez-vous${on}`, `Merge${on}`)
    case 'on ramp':
      return pick(lang, `Prenez la bretelle d'accès${on}`, `Take the on-ramp${on}`)
    case 'off ramp':
      return pick(lang, `Prenez la sortie${on}`, `Take the off-ramp${on}`)
    case 'fork': {
      const side = m.modifier && TURN[m.modifier] ? pick(lang, TURN[m.modifier].fr, TURN[m.modifier].en) : ''
      return pick(lang, `À l'embranchement, ${side.toLowerCase()}`, `At the fork, ${side.toLowerCase()}`) + on
    }
    case 'end of road': {
      const side = m.modifier && TURN[m.modifier] ? pick(lang, TURN[m.modifier].fr, TURN[m.modifier].en) : pick(lang, 'continuez', 'continue')
      return pick(lang, `Au bout de la route, ${side.toLowerCase()}`, `At the end of the road, ${side.toLowerCase()}`) + on
    }
    case 'new name':
    case 'continue':
      return pick(lang, `Continuez${on}`, `Continue${on}`)
    case 'turn':
    default: {
      const key = m.modifier ?? 'straight'
      const base = TURN[key] ? pick(lang, TURN[key].fr, TURN[key].en) : pick(lang, 'Continuez', 'Continue')
      return base + on
    }
  }
}

/** Parses a single OSRM route into our selectable RouteResult (with steps). */
export function parseOsrmRoute(raw: OsrmRoute, lang: string): RouteResult {
  const steps: RouteStep[] = []
  for (const leg of raw.legs ?? []) {
    for (const s of leg.steps ?? []) {
      steps.push({
        text:     maneuverText(s.maneuver, s.name ?? '', lang),
        iconKey:  iconKeyFor(s.maneuver),
        distance: s.distance,
        duration: s.duration,
        name:     s.name ?? '',
        location: s.maneuver.location,
      })
    }
  }
  return {
    distance: raw.distance,
    duration: raw.duration,
    geometry: raw.geometry ?? null,
    steps,
  }
}

/** Formats a distance for display (m / km). */
export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`
}

/** Formats a duration for display (h / min). */
export function fmtDurationShort(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`
}
