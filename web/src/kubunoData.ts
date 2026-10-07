/**
 * Cross-module data sharing over the clipboard (JSON envelopes) — producer side.
 *
 * VENDORED from core `@kubuno/sdk` (`DataTransferRegistry`): replace the local
 * copy with `import { … } from '@kubuno/sdk'` once `@kubuno/sdk >= 0.1.3` is
 * published on npm. The runtime contract (envelope shape, `data-kubuno` HTML
 * marker, `core.data-card` extension point) is shared with the host and all
 * consumer modules, so the two copies MUST stay in sync.
 *
 * The envelope travels in two clipboard flavors at once: `text/plain` holds a
 * human-readable summary, `text/html` holds `<span data-kubuno="<base64 JSON>">`
 * that consumer modules (chat…) detect in their paste handlers.
 */
import { ExtensionRegistry, ModuleServiceRegistry } from '@kubuno/sdk'
import type React from 'react'
import type { SearchResult } from './geocoding'
import type { RouteResult, LatLng } from './routing'
import { fmtDistance, fmtDurationShort } from './routing'

export interface KubunoDataEnvelope {
  kubuno: 1
  type: string
  module: string
  title?: string
  text?: string
  href?: string
  data: unknown
}

/** Extension point through which producer modules register their card renderers. */
export const DATA_CARD_EXTENSION = 'core.data-card'

export interface DataCardProps { envelope: KubunoDataEnvelope }

/** Static rendering of an envelope, for consumers that cannot host live React. */
export interface DataCardStaticRender {
  svg?: string
  dataUrl?: string
  width: number
  height: number
}

export interface DataCardRenderer {
  types: string[]
  Component?: React.ComponentType<DataCardProps>
  renderStatic?: (envelope: KubunoDataEnvelope) => Promise<DataCardStaticRender | null>
}

/** Registers this module's card renderer on the shared extension point. */
export function registerDataCardRenderer(moduleId: string, renderer: DataCardRenderer): void {
  ExtensionRegistry.register(DATA_CARD_EXTENSION, moduleId, renderer)
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function kubunoDataToHtml(envelope: KubunoDataEnvelope): string {
  const b64 = encodeBase64Utf8(JSON.stringify(envelope))
  const label = envelope.text ?? envelope.title ?? envelope.type
  return `<span data-kubuno="${b64}">${escapeHtml(label)}</span>`
}

/** `document.execCommand('copy')` path for browsers without the async clipboard API. */
function execCopy(text: string, html: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault()
    e.clipboardData?.setData('text/plain', text)
    e.clipboardData?.setData('text/html', html)
  }
  document.addEventListener('copy', onCopy, true)
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
}

/** Writes an envelope to the system clipboard (dual `text/plain` + `text/html`). */
export async function copyKubunoData(envelope: KubunoDataEnvelope): Promise<boolean> {
  const text = envelope.text ?? envelope.title ?? JSON.stringify(envelope)
  const html = kubunoDataToHtml(envelope)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })])
      return true
    } catch { /* permission denied or insecure context: fall back */ }
  }
  return execCopy(text, html)
}

/* ── Maps-specific envelope builders ─────────────────────────────────────── */

export interface MapsPlaceData {
  lat: number
  lng: number
  name: string
  display_name?: string
  category?: string
  osm_type?: string
  osm_id?: number
}

export interface MapsRouteData {
  distance: number
  duration: number
  mode: string
  waypoints: { lat: number; lng: number; label?: string }[]
  /** Downsampled [lng, lat] polyline of the selected route. */
  geometry?: [number, number][]
}

export interface MapsViewData { lat: number; lng: number; zoom: number }

function placeHref(lat: number, lng: number, name?: string): string {
  const q = name ? `&q=${encodeURIComponent(name)}` : ''
  return `/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}${q}`
}

/** Envelope for a bare point or a named place (context menu, POI, saved place). */
export function pointEnvelope(lat: number, lng: number, name?: string): KubunoDataEnvelope {
  const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  const data: MapsPlaceData = { lat, lng, name: name ?? coords }
  return {
    kubuno: 1,
    type: 'maps.place',
    module: 'maps',
    title: name ?? coords,
    text: `${name ? `${name} — ` : ''}${coords}\n${location.origin}${placeHref(lat, lng, name)}`,
    href: placeHref(lat, lng, name),
    data,
  }
}

/** Envelope for a full search result / place panel entry. */
export function placeEnvelope(place: SearchResult): KubunoDataEnvelope {
  const lat = parseFloat(place.lat)
  const lng = parseFloat(place.lon)
  const name = place.namedetails?.name || place.display_name.split(',')[0].trim()
  const env = pointEnvelope(lat, lng, name)
  const data = env.data as MapsPlaceData
  data.display_name = place.display_name
  if (place.category) data.category = place.category
  if (place.osm_type) data.osm_type = place.osm_type
  if (place.osm_id != null) data.osm_id = place.osm_id
  return env
}

/** Envelope for the currently selected route (waypoints + downsampled polyline). */
export function routeEnvelope(route: RouteResult, waypoints: LatLng[], mode: string): KubunoDataEnvelope {
  const pts = waypoints.map(w => ({ lat: w.lat, lng: w.lng, label: w.label }))
  // Cap the polyline so envelopes stay clipboard/message friendly.
  const MAX_POINTS = 300
  let geometry: [number, number][] | undefined
  if (route.geometry?.coordinates?.length) {
    const coords = route.geometry.coordinates
    const step = Math.max(1, Math.ceil(coords.length / MAX_POINTS))
    geometry = coords.filter((_, i) => i % step === 0 || i === coords.length - 1)
  }
  const data: MapsRouteData = { distance: route.distance, duration: route.duration, mode, waypoints: pts, geometry }
  const summary = `${fmtDistance(route.distance)} · ${fmtDurationShort(route.duration)}`
  const labels = pts.map(p => p.label ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
  const last = pts[pts.length - 1]
  return {
    kubuno: 1,
    type: 'maps.route',
    module: 'maps',
    title: labels.join(' → '),
    text: `${labels.join(' → ')}\n${summary}`,
    href: last ? placeHref(last.lat, last.lng, last.label) : '/maps',
    data,
  }
}

/** Envelope for the current viewport (center + zoom). */
export function viewEnvelope(lat: number, lng: number, zoom: number): KubunoDataEnvelope {
  const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  const data: MapsViewData = { lat, lng, zoom }
  return {
    kubuno: 1,
    type: 'maps.view',
    module: 'maps',
    title: coords,
    text: `${coords} (zoom ${zoom.toFixed(1)})\n${location.origin}${placeHref(lat, lng)}`,
    href: placeHref(lat, lng),
    data,
  }
}

/** Opens the core's cross-module label picker on the element an envelope describes. */
export function openLabelPicker(envelope: KubunoDataEnvelope): Promise<boolean> {
  return ModuleServiceRegistry.call<Promise<boolean>>('core', 'openLabelPicker', envelope)
    ?? Promise.resolve(false)
}
