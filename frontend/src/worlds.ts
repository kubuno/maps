// « Mondes » : autres astres cartographiables. La Terre utilise les styles
// habituels ; la Lune et Mars utilisent des tuiles raster libres
// (OpenPlanetary / NASA-USGS, vérifiées joignables). Les autres planètes sont
// présentes dans la vue « système solaire » mais pas encore cartographiées.

import type { StyleSpecification } from 'maplibre-gl'

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
const OPM = 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named'

function rasterWorld(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { world: { type: 'raster', tileSize: 256, maxzoom, tiles, attribution } },
    layers: [{ id: 'world', type: 'raster', source: 'world' }],
  }
}

export function moonStyle(): StyleSpecification {
  return rasterWorld([`${OPM}/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png`], '© OpenPlanetary · NASA LRO', 7)
}
export function marsStyle(): StyleSpecification {
  return rasterWorld([`${OPM}/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png`], '© OpenPlanetary · NASA/USGS', 7)
}

// Textures équirectangulaires libres (threex.planets, via jsDelivr → CORS *,
// indispensable pour les textures WebGL). Modèles 3D réels des astres.
const TEX = 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images'
const GLOBE = 'https://cdn.jsdelivr.net/npm/three-globe/example/img'   // Terre HD (CORS)
export const SATURN_RING_TEXTURE = `${TEX}/saturnringcolor.jpg`
export const EARTH_CLOUDS = `${TEX}/earthcloudmaptrans.jpg`

// Halo atmosphérique (coquille de Fresnel) — couleur + épaisseur + intensité.
export interface Atmo { color: number; size: number; intensity: number }

// Lune décorative (non cartographiée) en orbite autour d'une planète.
// realR = rayon réel (km) ; realKm = distance réelle au centre de la planète (km).
export interface Sat { name: string; size: number; dist: number; color: string; speed: number; realR: number; realKm: number }
export interface Ring { inner: number; outer: number; texture?: string; color?: number; opacity: number }

// Constantes d'échelle réelle (1 UA = 200 unités scène ; tout le reste suit).
export const AU_KM = 149_597_870
export const REAL_AU_UNITS = 200
export const REAL_KM = REAL_AU_UNITS / AU_KM   // unités scène par km

export interface World {
  id:         string
  name:       string
  kind:       'star' | 'planet' | 'moon'
  color:      string
  size:       number              // rayon de la sphère 3D (unités scène)
  orbit:      number              // rayon d'orbite (0 = Soleil au centre)
  travelable: boolean             // a-t-on une carte ?
  texture:    string              // texture 3D équirectangulaire
  bump?:      string              // carte de relief (bump map)
  tilt?:      number              // inclinaison de l'axe (deg)
  rotH?:      number              // période de rotation propre (h ; négatif = rétrograde)
  periodD?:   number              // période de révolution (jours)
  L0?:        number              // longitude moyenne à J2000 (deg) — position réelle
  incl?:      number              // inclinaison du plan orbital (deg)
  node?:      number              // longitude du nœud ascendant Ω (deg)
  parent?:    string              // si défini : orbite ce corps (ex. Lune→Terre)
  realR:      number              // rayon réel (km) — pour l'échelle réelle
  realAU?:    number              // demi-grand axe réel (UA) autour du Soleil
  realKm?:    number              // distance réelle au parent (km) — lunes
  atmosphere?: Atmo
  ring?:      Ring
  moons?:     Sat[]
  style?:     () => StyleSpecification
  center?:    [number, number]
  zoom?:      number
}

// Jour julien + longitude héliocentrique RÉELLE à la date courante (approx. Kepler
// linéaire : longitude moyenne L0 à J2000 + mouvement moyen). Suffisant pour
// positionner les planètes dans leur configuration actuelle.
export function realLongitudeDeg(L0: number, periodD: number, nowMs: number): number {
  const jd = nowMs / 86400000 + 2440587.5
  const d = jd - 2451545.0                       // jours depuis J2000
  return (((L0 + (360 * d) / periodD) % 360) + 360) % 360
}

// Tailles stylisées (lisibilité) ; distances élargies proportionnellement ;
// positions orbitales = RÉELLES (L0 + periodD à la date courante).
export const WORLDS: World[] = [
  { id: 'sun',     name: 'Soleil',  kind: 'star',   color: '#ffcf45', size: 32, orbit: 0,   travelable: false, texture: `${TEX}/sunmap.jpg`, rotH: 600, realR: 696000 },
  { id: 'mercury', name: 'Mercure', kind: 'planet', color: '#9c8b7d', size: 2.2, orbit: 180,  travelable: false, texture: `${TEX}/mercurymap.jpg`, bump: `${TEX}/mercurybump.jpg`, tilt: 0.03, rotH: 1407.6, periodD: 87.969,  L0: 252.25, incl: 7.0,  node: 48.3,  realR: 2440,  realAU: 0.387 },
  { id: 'venus',   name: 'Vénus',   kind: 'planet', color: '#e6c98c', size: 5.4, orbit: 300, travelable: false, texture: `${TEX}/venusmap.jpg`,   bump: `${TEX}/venusbump.jpg`,   tilt: 177.4, rotH: -5832,  periodD: 224.701, L0: 181.98, incl: 3.4,  node: 76.7,  realR: 6052,  realAU: 0.723, atmosphere: { color: 0xe8d6a0, size: 1.16, intensity: 1.0 } },
  { id: 'earth',   name: 'Terre',   kind: 'planet', color: '#4f9dde', size: 5.6, orbit: 435, travelable: true,  texture: `${GLOBE}/earth-blue-marble.jpg`, bump: `${GLOBE}/earth-topology.png`, tilt: 23.44, rotH: 23.93,  periodD: 365.256, L0: 100.46, incl: 0, node: 0, realR: 6371,  realAU: 1.0, center: [2.3522, 48.8566], zoom: 4, atmosphere: { color: 0x6dacff, size: 1.13, intensity: 0.95 },
    moons: [] },
  { id: 'moon',    name: 'Lune',    kind: 'moon',   color: '#cfcfcf', size: 1.5, orbit: 14,  travelable: true,  texture: `${TEX}/moonmap1k.jpg`, bump: `${TEX}/moonbump1k.jpg`, parent: 'earth', rotH: 655, periodD: 27.32, L0: 0, realR: 1737, realKm: 384400, style: moonStyle, center: [0, 0], zoom: 2 },
  { id: 'mars',    name: 'Mars',    kind: 'planet', color: '#d0673e', size: 3,  orbit: 585, travelable: true,  texture: `${TEX}/marsmap1k.jpg`, bump: `${TEX}/marsbump1k.jpg`, tilt: 25.19, rotH: 24.62, periodD: 686.98,  L0: 355.45, incl: 1.85, node: 49.6,  realR: 3390, realAU: 1.524, style: marsStyle, center: [0, 0], zoom: 2, atmosphere: { color: 0xe39a6a, size: 1.08, intensity: 0.5 },
    moons: [ { name: 'Phobos', size: 0.6, dist: 7, color: '#8a7a6a', speed: 0.09, realR: 11, realKm: 9376 }, { name: 'Déimos', size: 0.5, dist: 11, color: '#9a8a78', speed: 0.05, realR: 6, realKm: 23463 } ] },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', color: '#caa97a', size: 16, orbit: 945, travelable: false, texture: `${TEX}/jupitermap.jpg`, tilt: 3.13, rotH: 9.93, periodD: 4332.59, L0: 34.40, incl: 1.3,  node: 100.5, realR: 69911, realAU: 5.203, atmosphere: { color: 0xe6cfa6, size: 1.05, intensity: 0.45 },
    ring: { inner: 1.55, outer: 1.85, color: 0xb9a98c, opacity: 0.18 },
    moons: [ { name: 'Io', size: 1, dist: 26, color: '#e6d27a', speed: 0.06, realR: 1822, realKm: 421700 }, { name: 'Europe', size: 0.9, dist: 32, color: '#d8cbb0', speed: 0.045, realR: 1561, realKm: 671000 }, { name: 'Ganymède', size: 1.4, dist: 40, color: '#9a8d7a', speed: 0.03, realR: 2634, realKm: 1070000 }, { name: 'Callisto', size: 1.3, dist: 50, color: '#6e6253', speed: 0.022, realR: 2410, realKm: 1883000 } ] },
  { id: 'saturn',  name: 'Saturne', kind: 'planet', color: '#e0c187', size: 13, orbit: 1230, travelable: false, texture: `${TEX}/saturnmap.jpg`, tilt: 26.73, rotH: 10.66, periodD: 10759.22, L0: 49.95, incl: 2.49, node: 113.7, realR: 58232, realAU: 9.537, atmosphere: { color: 0xe6d3a8, size: 1.05, intensity: 0.4 },
    ring: { inner: 1.35, outer: 2.3, texture: `${TEX}/saturnringcolor.jpg`, opacity: 0.9 },
    moons: [ { name: 'Titan', size: 1.3, dist: 40, color: '#c8a45e', speed: 0.03, realR: 2575, realKm: 1221870 }, { name: 'Rhéa', size: 0.8, dist: 52, color: '#b7b2a8', speed: 0.02, realR: 764, realKm: 527108 } ] },
  { id: 'uranus',  name: 'Uranus',  kind: 'planet', color: '#9fd6e0', size: 8,  orbit: 1500, travelable: false, texture: `${TEX}/uranusmap.jpg`, tilt: 97.77, rotH: -17.24, periodD: 30688.5, L0: 313.23, incl: 0.77, node: 74.0,  realR: 25362, realAU: 19.191, atmosphere: { color: 0xa8e6e0, size: 1.07, intensity: 0.6 },
    ring: { inner: 1.5, outer: 1.7, color: 0x9fd6e0, opacity: 0.25 },
    moons: [ { name: 'Titania', size: 0.9, dist: 18, color: '#bfc6cc', speed: 0.03, realR: 789, realKm: 435910 } ] },
  { id: 'neptune', name: 'Neptune', kind: 'planet', color: '#5b7bd6', size: 8,  orbit: 1755, travelable: false, texture: `${TEX}/neptunemap.jpg`, tilt: 28.32, rotH: 16.11, periodD: 60182, L0: 304.88, incl: 1.77, node: 131.8, realR: 24622, realAU: 30.07, atmosphere: { color: 0x6f93e0, size: 1.07, intensity: 0.7 },
    moons: [ { name: 'Triton', size: 1, dist: 18, color: '#c7c0b8', speed: -0.028, realR: 1353, realKm: 354759 } ] },
]

export function worldById(id: string): World | undefined {
  return WORLDS.find(w => w.id === id)
}

// Taille/orbite de rendu selon le mode (réel = km/UA × échelle ; lisible = stylisé).
export const bodySize  = (w: World, real: boolean) => (real ? w.realR * REAL_KM : w.size)
export const bodyOrbit = (w: World, real: boolean) =>
  !real ? w.orbit : (w.parent ? (w.realKm ?? 0) * REAL_KM : (w.realAU ?? 0) * REAL_AU_UNITS)
export const satSize = (s: Sat, real: boolean) => (real ? s.realR * REAL_KM : s.size)
export const satDist = (s: Sat, real: boolean) => (real ? s.realKm * REAL_KM : s.dist)

// Quelques repères de surface notables (étiquettes sur les cartes Lune/Mars).
// Coordonnées sélénographiques / aréographiques (lat, lng en −180..180 Est+).
export interface BodyFeature { name: string; lat: number; lng: number }

export const MOON_FEATURES: BodyFeature[] = [
  { name: 'Mer de la Tranquillité', lat: 8.5, lng: 31.4 },
  { name: 'Mer des Pluies', lat: 32.8, lng: -15.6 },
  { name: 'Mer de la Sérénité', lat: 28, lng: 17.5 },
  { name: 'Océan des Tempêtes', lat: 18.4, lng: -57.4 },
  { name: 'Tycho', lat: -43.3, lng: -11.4 },
  { name: 'Copernic', lat: 9.6, lng: -20.1 },
  { name: 'Aristarque', lat: 23.7, lng: -47.4 },
  { name: 'Apollo 11', lat: 0.67, lng: 23.47 },
]

export const MARS_FEATURES: BodyFeature[] = [
  { name: 'Olympus Mons', lat: 18.65, lng: -133.8 },
  { name: 'Valles Marineris', lat: -13, lng: -70 },
  { name: 'Cratère Gale (Curiosity)', lat: -5.4, lng: 137.8 },
  { name: 'Cratère Jezero (Perseverance)', lat: 18.4, lng: 77.5 },
  { name: 'Hellas Planitia', lat: -42.7, lng: 70 },
  { name: 'Elysium Mons', lat: 25, lng: 147 },
  { name: 'Tharsis', lat: 0, lng: -100 },
]
