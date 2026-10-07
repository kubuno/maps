/**
 * Choosing a point on Earth, for a form that lives in another component.
 *
 * The console's building sheet has a latitude and a longitude to fill in. On
 * its own it offers two number fields, because it must work on an instance
 * where no map exists. This is what it offers instead when Maps is installed:
 * the same two values, obtained by pointing at the place.
 *
 * ## What it is not
 *
 * Not the Maps page in miniature. No search history, no layers, no route — a
 * field is not an application, and every control here answers the single
 * question the form asked. Nothing about buildings is hard-coded either: the
 * contract is a coordinate, so the same component will serve the next form that
 * needs one.
 *
 * ## Why a DOM marker rather than a GL layer
 *
 * `MiniMap` draws its points into the WebGL canvas, which is right for plotting
 * many read-only points. Here there is exactly one and it must be draggable —
 * something MapLibre gives a `Marker` for free and that would have to be
 * written by hand against a canvas layer (grab, move, hit-test, cursor).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Search, X } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnchoredPopover, Input, Spinner } from '@ui'
import { DEFAULT_STYLE } from './mapsLayers'
import { registerThemeProtocol, installThemeImages } from './mapsTheme'
import { buildNominatimSearchUrl, type SearchResult } from './geocoding'
import { fetchResults } from './searchRows'

/** Six decimals ≈ 11 cm. Beyond that a building's "position" is a fiction, and
 *  the extra digits only make the field harder to read. */
const PRECISION = 6

const fmt = (n: number) => n.toFixed(PRECISION).replace(/0+$/, '').replace(/\.$/, '')

/** A coordinate the form can hand to a map, or `null` while it has none. */
function parse(lat: string, lon: string): { lat: number; lng: number } | null {
  const a = Number(lat.trim().replace(',', '.'))
  const b = Number(lon.trim().replace(',', '.'))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (lat.trim() === '' || lon.trim() === '') return null
  if (a < -90 || a > 90 || b < -180 || b > 180) return null
  return { lat: a, lng: b }
}

/**
 * Type an address, get a place.
 *
 * Built on the shared primitives — `Input` for the field, `AnchoredPopover` for
 * the results — rather than on this module's own `MapsAddressInput`. Two
 * reasons, and the first is the rule: that component is a hand-rolled frame
 * around a bare `<input>`, which the project forbids. The second is that this
 * field lives in a CONSOLE form, beside fields drawn by the host: a control with
 * its own borders, its own height and its own type scale reads as a foreign
 * object there, however good it looks on the map page it was drawn for.
 */
function AddressSearch({ onPick, disabled }: {
  onPick:    (lat: number, lng: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('maps')
  const anchor = useRef<HTMLDivElement>(null)
  const timer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  // Typing is not a query. One request per keystroke would hammer a public
  // geocoder and answer out of order; the last pause of 400 ms is the question.
  const ask = (text: string) => {
    setQ(text)
    if (timer.current) clearTimeout(timer.current)
    if (text.trim().length < 3) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = await fetchResults(buildNominatimSearchUrl(text.trim(), 5))
        setResults(rows)
        setOpen(rows.length > 0)
      } catch {
        setResults([]); setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div ref={anchor}>
      <Input
        value={q}
        disabled={disabled}
        placeholder={t('maps_pick_search')}
        leftIcon={<Search size={15} />}
        rightIcon={loading ? <Spinner size="xs" /> : undefined}
        onChange={e => ask(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true) }}
      />
      <AnchoredPopover anchorRef={anchor} open={open} onClose={() => setOpen(false)}>
        <ul
          className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-0 py-1 shadow-xl"
          style={{ width: anchor.current?.offsetWidth ?? 320 }}
        >
          {results.map(r => (
            <li key={r.place_id}>
              <button
                type="button"
                // Keep the caret in the field: a result list that steals focus
                // makes correcting the query a second click.
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onPick(Number(r.lat), Number(r.lon))
                  setQ(''); setResults([]); setOpen(false)
                }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-1"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
                <span className="line-clamp-2 leading-snug text-text-primary"
                      style={{ fontSize: 'var(--kb-text-body)' }}>
                  {r.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </AnchoredPopover>
    </div>
  )
}

export interface MapsLocationPickerProps {
  latitude:  string
  longitude: string
  /** The postal address already typed in the form, if any — a starting hint. */
  address?:  string
  disabled?: boolean
  /** Always both values, or both empty. */
  onChange: (latitude: string, longitude: string) => void
}

export default function MapsLocationPicker({
  latitude, longitude, address, disabled, onChange,
}: MapsLocationPickerProps) {
  // The module's own namespace — its keys live under it, and a bare
  // `useTranslation()` would render them as their own names.
  const { t } = useTranslation('maps')
  const divRef    = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  // The handlers close over `onChange`/`disabled`, and MapLibre keeps whichever
  // function it was given at `on()` time — a ref keeps them current without
  // tearing the map down on every render of the form above.
  const emit = useRef(onChange); emit.current = onChange
  const off  = useRef(disabled); off.current  = disabled

  const [webglError, setWebglError] = useState(false)
  const [searching,  setSearching]  = useState(false)
  const [notFound,   setNotFound]   = useState(false)

  const point = parse(latitude, longitude)

  const set = (lat: number, lng: number) => {
    setNotFound(false)
    emit.current(fmt(lat), fmt(lng))
  }

  /**
   * Set the point AND take the map there.
   *
   * For a click or a drag, moving the map would be wrong — the operator is
   * already looking at the spot they pointed at. Answering a SEARCH is the
   * opposite: they named a place they cannot see, and leaving the view on the
   * whole world drops the pin somewhere off at the edge, which reads as nothing
   * having happened. Measured: after picking "Tour Eiffel" the marker landed on
   * the top border of a world map.
   */
  const goTo = (lat: number, lng: number) => {
    set(lat, lng)
    mapRef.current?.easeTo({ center: [lng, lat], zoom: 16, duration: 700 })
  }

  // ── The map, created once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      registerThemeProtocol(maplibregl)
      map = new maplibregl.Map({
        container: divRef.current,
        style: DEFAULT_STYLE,
        // Somewhere already chosen, or the whole world to choose from.
        center: point ? [point.lng, point.lat] : [5, 30],
        zoom:   point ? 15 : 1.1,
        attributionControl: false,
      })
    } catch {
      // No WebGL (locked-down or headless browsers). The two fields below still
      // work, so the operator is never stuck without a way to enter a position.
      setWebglError(true)
      return
    }
    installThemeImages(map)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', e => { if (!off.current) set(e.lngLat.lat, e.lngLat.lng) })
    map.getCanvas().style.cursor = 'crosshair'

    // Starts disabled. Who may turn the wheel is decided by the focus of the
    // whole control — see `grantWheel` below.

    map.scrollZoom.disable()

    mapRef.current = map

    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── The marker follows the value, wherever the value came from ─────────────
  // Typed into the fields, dropped by a click, or returned by a search: the
  // form's state is the single source of truth, and the map only reflects it.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!point) { markerRef.current?.remove(); markerRef.current = null; return }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ draggable: !disabled, color: '#1a73e8' })
        .setLngLat([point.lng, point.lat])
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current?.getLngLat()
        if (p) set(p.lat, p.lng)
      })
    } else {
      markerRef.current.setLngLat([point.lng, point.lat])
      markerRef.current.setDraggable(!disabled)
    }
    // Follow only when the point left the view: re-centring on every keystroke
    // would fight someone who has panned the map to look around it.
    if (!map.getBounds().contains([point.lng, point.lat])) {
      map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 13), duration: 500 })
    }
  }, [latitude, longitude, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Put the pin on the address the operator already typed in the form. */
  const locateAddress = async () => {
    const q = (address ?? '').trim()
    if (!q) return
    setSearching(true); setNotFound(false)
    try {
      const hit = (await fetchResults(buildNominatimSearchUrl(q, 1)))[0]
      if (!hit) { setNotFound(true); return }
      goTo(Number(hit.lat), Number(hit.lon))
    } catch {
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  /**
   * The wheel belongs to the FORM until this control is taken.
   *
   * A map in the middle of a sheet swallows every wheel turn that passes over
   * it: the reader scrolls towards the fields below, the pointer crosses the
   * map, and instead of moving on they find themselves in orbit over the
   * Atlantic. Scroll-zoom is therefore granted only while the control holds
   * focus — and "the control" is the SEARCH FIELD AND THE MAP together, because
   * that is the unit a person uses: name a place, then zoom in on it, without a
   * click in between.
   *
   * Disabled, MapLibre does not swallow the event and the sheet scrolls as if
   * the map were a picture. The zoom buttons work throughout, so this is never a
   * trap for someone who never clicks.
   */
  const grantWheel = (on: boolean) => { const m = mapRef.current; if (m) on ? m.scrollZoom.enable() : m.scrollZoom.disable() }

  return (
    <div className="flex flex-col gap-2">
      {!webglError && (
        <div
          className="flex flex-col gap-2"
          onFocus={() => grantWheel(true)}
          // Moving from the search field to the map is still "inside": without
          // this guard the grant would be revoked and re-granted on every hop.
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) grantWheel(false) }}
        >
          <AddressSearch disabled={disabled} onPick={goTo} />
          <div className="relative">
            <div
              ref={divRef}
              // Tall enough to aim, short enough that it does not push the rest
              // of the sheet out of a scrolling dialog.
              style={{ height: 190, width: '100%', borderRadius: 8, overflow: 'hidden' }}
              className="border border-border"
            />
            {/* The answer, written where the eye already is. The editable fields
                are below the fold in a scrolling sheet, so without this a click
                would produce no visible result at all. */}
            <span
              className="pointer-events-none absolute bottom-2 left-2 rounded bg-[#202124]/80 px-2 py-1 tabular-nums text-white"
              style={{ fontSize: 'var(--kb-text-meta)' }}
            >
              {point ? `${fmt(point.lat)}, ${fmt(point.lng)}` : t('maps_pick_unset')}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-text-tertiary" style={{ fontSize: 'var(--kb-text-meta)' }}>
              {t('maps_pick_hint')}
            </span>
            <div className="flex items-center gap-3">
              {(address ?? '').trim() !== '' && (
                <button
                  type="button"
                  onClick={() => void locateAddress()}
                  disabled={disabled || searching}
                  className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                  style={{ fontSize: 'var(--kb-text-meta)' }}
                >
                  <MapPin size={13} />
                  {t('maps_pick_from_address')}
                </button>
              )}
              {point && (
                <button
                  type="button"
                  onClick={() => onChange('', '')}
                  disabled={disabled}
                  className="flex items-center gap-1 text-text-secondary hover:text-text-primary disabled:opacity-50"
                  style={{ fontSize: 'var(--kb-text-meta)' }}
                >
                  <X size={13} />
                  {t('maps_pick_clear')}
                </button>
              )}
            </div>
          </div>
          {notFound && (
            <span className="text-danger" style={{ fontSize: 'var(--kb-text-meta)' }}>
              {t('maps_pick_not_found')}
            </span>
          )}
        </div>
      )}

      {/* The numbers stay editable. Someone holding surveyed coordinates pastes
          them; a map that only accepts pointing would have taken that away. */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('maps_pick_latitude')}
          value={latitude}
          inputMode="decimal"
          disabled={disabled}
          onChange={e => onChange(e.target.value, longitude)}
        />
        <Input
          label={t('maps_pick_longitude')}
          value={longitude}
          inputMode="decimal"
          disabled={disabled}
          onChange={e => onChange(latitude, e.target.value)}
        />
      </div>

      {webglError && (
        <span className="text-text-tertiary" style={{ fontSize: 'var(--kb-text-meta)' }}>
          {t('maps_pick_no_webgl')}
        </span>
      )}
    </div>
  )
}
