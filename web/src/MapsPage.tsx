import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Search, MapPin, Star, Navigation, X, ChevronRight, Layers, RefreshCw, Route, Plus, Minus, Locate, Flag, Ruler, Shapes, Copy, Info, Compass, HelpCircle, WifiOff, Keyboard, Orbit, Type as TypeIcon,
} from 'lucide-react'
import { api } from '@kubuno/sdk'
import { MenuDropdown } from '@ui'
import { HeaderActions } from '@kubuno/sdk'
import { useChromelessHeader } from '@kubuno/sdk'
import { useUiStore } from '@kubuno/sdk'
import { useMapsUiStore } from './mapsUiStore'
import { MapsRoutePanel } from './MapsRoutePanel'
import { useRouteModes } from './useRouteModes'
import { parseRouteLink } from './routeLink'
import { MapsPlacePanel } from './MapsPlacePanel'
import { MapsSearchBar } from './MapsSearchBar'
import { MapsLayersPanel } from './MapsLayersPanel'
import { MapsLayersButton } from './MapsLayersButton'
import { MapsCategoryChips } from './MapsCategoryChips'
import {
  DEFAULT_STYLE, styleFor, applyProjection, applyLabels, applyCycle, applyRelief,
  applyTransit, applyPrecip, applyTerrain3D, addImportLayer, removeImportLayer,
  geoJsonBounds, kmlToGeoJSON,
  type BaseMap,
} from './mapsLayers'
import {
  mapNominatimResult, buildNominatimSearchUrl, buildNominatimReverseUrl, placeDetails,
  type SearchResult,
} from './geocoding'
import { POI_CHIPS, fetchNearbyPois, poiToSearchResult, type Poi } from './poi'
import { type RouteResult, type RouteGeometry } from './routing'
import { useSketch } from './useSketch'
import { copyKubunoData, openLabelPicker, pointEnvelope, routeEnvelope, viewEnvelope } from './kubunoData'
import { MapsSketchPanel } from './MapsSketchPanel'
import {
  MapsPlacesPanel,
  type Collection, type HistoryEntry, type PlacePatch,
} from './MapsPlacesPanel'
import { MapsElevationChart, type TrackData } from './MapsElevationChart'
import { useNavigation } from './useNavigation'
import { MapsNavOverlay } from './MapsNavOverlay'
import { registerOfflineProtocol, downloadArea, cachedTileCount, clearOfflineCache } from './mapOffline'
import { registerThemeProtocol, installThemeImages } from './mapsTheme'
import { MapsCosmos3D } from './MapsCosmos3D'
import { worldById, MOON_FEATURES, MARS_FEATURES, type World } from './worlds'
import { fmtDist, makePlaceEl, makePoiEl, makeWaypointEl, haversineM } from './mapMarkers'
import { PoiResultsPanel } from './MapsPoiResultsPanel'
import { GpxPanel, type GpxTrace } from './MapsGpxPanel'
import { SavePlaceModal } from './MapsSavePlaceModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapConfig {
  default_lat:  number
  default_lng:  number
  default_zoom: number
  style_url:    string
  /** Instance flags: a control the server would refuse is hidden, not offered. */
  enable_overpass?:      boolean
  allow_sketch_sharing?: boolean
}

interface Place {
  id:       string
  name:     string
  address:  string | null
  lat:      number
  lng:      number
  icon:     string
  category: string | null
  user_note: string | null
  user_tags: string[]
  collection_id: string | null
}


interface Waypoint { lat: number; lng: number; label?: string }


// ── Main component ────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { t, i18n } = useTranslation('maps')
  // Plein écran : masque l'en-tête global ; HeaderActions est réaffiché flottant
  // au-dessus de la carte (voir plus bas).
  useChromelessHeader()

  // À l'ouverture de Maps, la sidebar du core s'enroule par défaut (plus de place
  // pour la carte) ; on restaure l'état précédent en quittant le module.
  useEffect(() => {
    const prev = useUiStore.getState().sidebarCollapsed
    useUiStore.getState().setSidebarCollapsed(true)
    return () => useUiStore.getState().setSidebarCollapsed(prev)
  }, [])

  const mapDivRef  = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Record<string, maplibregl.Marker>>({})
  const lineIdsRef = useRef<Set<string>>(new Set())
  const [mapReady, setMapReady] = useState(false)

  // Croquis (mesure / dessin / annotations) — moteur de dessin sur la carte.
  const sketch = useSketch(mapRef, mapReady)

  // Onglet actif partagé avec la nav de la sidebar du core (MapsSidebarBody).
  const tab    = useMapsUiStore(s => s.tab)
  const setTab = useMapsUiStore(s => s.setTab)
  const panelCollapsed = useMapsUiStore(s => s.panelCollapsed)
  const [places,    setPlaces]    = useState<Place[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [history,   setHistory]   = useState<HistoryEntry[]>([])
  const [traces,    setTraces]    = useState<GpxTrace[]>([])
  // Profil d'élévation de la trace GPX affichée.
  const [trackData, setTrackData] = useState<{ name: string; data: TrackData } | null>(null)
  // Itinéraire avancé : ≥ 2 points (départ → étapes → arrivée), null = vide.
  const [waypoints, setWaypoints] = useState<(Waypoint | null)[]>([null, null])
  const [routePickMode, setRoutePickMode] = useState<number | null>(null)

  const [ctxMenu,   setCtxMenu]   = useState<{ x: number; y: number; lat: number; lng: number; name?: string } | null>(null)
  const [saveModal, setSaveModal] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null)
  // The left rail covers the map's left edge when a place or a tab card is open.
  const railOpen = !panelCollapsed && (!!selectedPlace || tab !== 'search')

  // ── Enregistrement d'une trace GPS ──
  const [recording, setRecording] = useState(false)
  const [recStats,  setRecStats]  = useState<{ points: number; dist: number; elapsed: number } | null>(null)
  const recPtsRef   = useRef<{ lng: number; lat: number; ele: number | null; time: string }[]>([])
  const recWatchRef = useRef<number | null>(null)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartRef = useRef<number>(0)

  // ── Exploration POI (chips de catégories) ──
  const [pois,        setPois]        = useState<Poi[]>([])
  const [activeCat,   setActiveCat]   = useState<string | null>(null)
  const [poiLoading,  setPoiLoading]  = useState(false)
  const [poiError,    setPoiError]    = useState<string | null>(null)
  // Centre de la dernière recherche POI (pour trier les résultats par distance).
  const [poiCenter,   setPoiCenter]   = useState<{ lat: number; lng: number } | null>(null)

  // ── Réglages d'instance (servis par /maps/config) ──
  // L'administrateur peut couper la recherche de POI et le partage public d'un
  // croquis. On masque le contrôle plutôt que de le laisser échouer côté serveur.
  const [poiEnabled,            setPoiEnabled]            = useState(true)
  const [sketchSharingAllowed,  setSketchSharingAllowed]  = useState(true)

  // ── État du panneau « Couches » ──
  const [layersOpen, setLayersOpen] = useState(false)
  const [baseMap,    setBaseMap]    = useState<BaseMap>('default')
  const [showLabels, setShowLabels] = useState(true)
  const [globe,      setGlobe]      = useState(true)
  const [cycle,      setCycle]      = useState(false)
  const [relief,     setRelief]     = useState(false)
  const [transit,    setTransit]    = useState(false)
  const [precip,     setPrecip]     = useState(false)
  const [terrain3d,  setTerrain3d]  = useState(false)
  // Calques importés (GeoJSON / KML) : id → nom de fichier ; data conservée en ref
  // pour pouvoir les redessiner après un changement de fond (setStyle).
  const [imports,    setImports]    = useState<{ id: string; name: string }[]>([])
  const importSeq = useRef(0)
  const importDataRef = useRef<Record<string, unknown>>({})

  // ── Accessibilité / hors-ligne (VAGUE 8) ──
  const [highContrast, setHighContrast] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  // Mondes / cosmos (Terre, Lune, Mars…).
  const [worldId, setWorldId] = useState('earth')
  const [cosmosOpen, setCosmosOpen] = useState(false)
  const [warping, setWarping] = useState(false)   // transition cinématique entre mondes
  const cosmosAutoRef = useRef(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [cachedTiles, setCachedTiles] = useState(0)
  const [dlProgress, setDlProgress] = useState<{ done: number; total: number } | null>(null)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    registerOfflineProtocol(maplibregl)   // kbtile:// protocol (cache-first offline tiles)
    registerThemeProtocol(maplibregl)     // kbstyle:// protocol (Kubuno-themed default basemap)

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: DEFAULT_STYLE,
      center: [2.3522, 48.8566],   // [lng, lat]
      zoom: 11,
    })
    installThemeImages(map)               // road shields generated on demand
    // Projection globe (dezoom → planète entière) : à appliquer UNE FOIS le style
    // chargé, sinon MapLibre lève « Style is not done loading » et plante la page.
    map.on('load', () => {
      try { map.setProjection({ type: 'globe' }) } catch { /* ignore */ }
      // Halo atmosphérique bleuté de la Terre (visible sur le globe dézoomé).
      try {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 6, 0] as unknown as number, 'sky-color': '#5a9be0', 'horizon-color': '#bcd9f5', 'fog-color': '#dfecfb' })
      } catch { /* setSky indispo */ }
      setMapReady(true)
    })

    // Try to load config for default view
    api.get<MapConfig>('/maps/config').then(({ data }) => {
      if (data.default_lat && data.default_lng) {
        map.jumpTo({ center: [data.default_lng, data.default_lat], zoom: data.default_zoom ?? 12 })
      }
      // An older backend sends neither flag; treat a missing flag as "allowed"
      // so this module keeps working against a core that predates them.
      setPoiEnabled(data.enable_overpass !== false)
      setSketchSharingAllowed(data.allow_sketch_sharing !== false)
    }).catch(() => {/* use defaults */})

    // Right-click context menu
    map.on('contextmenu', (e) => {
      setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // Click on map — remplit le point d'itinéraire en cours de sélection.
    map.on('click', (e) => {
      setRoutePickMode(idx => {
        if (idx === null) return idx
        setWaypoints(wp => { const n = [...wp]; n[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }; return n })
        return null
      })
      setCtxMenu(null)
    })

    mapRef.current = map

    // La carte est créée avant que son conteneur ait sa taille DÉFINITIVE :
    // l'en-tête chromeless se masque et la sidebar se met en place APRÈS le
    // montage. MapLibre mesure alors un conteneur trop petit et le canvas y reste
    // figé jusqu'au prochain resize (d'où « ça remplit seulement après avoir
    // (dé)roulé la sidebar »). On force donc un resize après la 1ʳᵉ mise en page
    // ET on observe le conteneur pour tout changement ultérieur.
    // Coalesce resizes to at most one per animation frame. A window drag fires
    // ResizeObserver dozens of times per second; resizing the GL drawing buffer
    // on every tick reallocates it, and the browser resets the freed canvas to
    // transparent — so the dark `.maps-space` background behind the globe shows
    // through for a frame (the black flicker the user saw). `redraw()` renders
    // synchronously into the just-resized buffer in the SAME frame, so no empty
    // frame is ever composited; coalescing keeps it to one such pass per frame.
    let resizeRaf = 0
    const scheduleResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        try { map.resize(); map.redraw() } catch { /* carte retirée */ }
      })
    }
    const ro = new ResizeObserver(scheduleResize)
    ro.observe(mapDivRef.current)
    const raf = requestAnimationFrame(scheduleResize)
    const t1  = setTimeout(scheduleResize, 250)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      clearTimeout(t1)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load saved places ────────────────────────────────────────────────────────
  const loadPlaces = useCallback(async () => {
    try {
      const { data } = await api.get<{ places: Place[] }>('/maps/places')
      setPlaces(data.places ?? [])
    } catch {/* ignore */}
  }, [])

  const loadTraces = useCallback(async () => {
    try {
      const { data } = await api.get<{ traces: GpxTrace[] }>('/maps/gpx')
      setTraces(data.traces ?? [])
    } catch {/* ignore */}
  }, [])

  // ── Données perso : listes (collections) + historique de recherche ─────────────
  const loadCollections = useCallback(async () => {
    try {
      const { data } = await api.get<{ collections: Collection[] }>('/maps/collections')
      setCollections(data.collections ?? [])
    } catch {/* ignore */}
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get<{ history: HistoryEntry[] }>('/maps/search/history')
      setHistory(data.history ?? [])
    } catch {/* ignore */}
  }, [])

  const createCollection = useCallback(async (name: string, color: string) => {
    try {
      await api.post('/maps/collections', { name, color })
      await loadCollections()
    } catch {/* ignore */}
  }, [loadCollections])

  const deleteCollection = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/collections/${id}`)
      await Promise.all([loadCollections(), loadPlaces()])
    } catch {/* ignore */}
  }, [loadCollections, loadPlaces])

  const updatePlace = useCallback(async (id: string, patch: PlacePatch) => {
    try {
      await api.patch(`/maps/places/${id}`, patch)
      await Promise.all([loadPlaces(), loadCollections()])
    } catch {/* ignore */}
  }, [loadPlaces, loadCollections])

  const clearHistory = useCallback(async () => {
    try {
      await api.delete('/maps/search/history')
      setHistory([])
    } catch {/* ignore */}
  }, [])

  // Exporte tous les lieux enregistrés en GeoJSON (téléchargement client).
  const exportPlaces = useCallback(() => {
    const fc = {
      type: 'FeatureCollection',
      features: places.map(p => ({
        type: 'Feature',
        properties: { name: p.name, category: p.category, note: p.user_note, tags: p.user_tags, icon: p.icon, address: p.address },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kubuno-lieux.geojson'; a.click()
    URL.revokeObjectURL(url)
  }, [places])

  // Importe des lieux depuis un GeoJSON (chaque Point devient un lieu enregistré).
  const importPlaces = useCallback(async (file: File) => {
    try {
      const fc = JSON.parse(await file.text()) as { features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: [number, number] } }[] }
      const feats = (fc.features ?? []).filter(f => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
      for (const f of feats) {
        const [lng, lat] = f.geometry!.coordinates as [number, number]
        const p = f.properties ?? {}
        await api.post('/maps/places', {
          name: String(p.name ?? 'Lieu importé'),
          lat, lng,
          address: (p.address as string) ?? null,
          user_note: (p.note as string) ?? null,
          user_tags: Array.isArray(p.tags) ? p.tags : [],
          icon: (p.icon as string) ?? '📍',
        })
      }
      await loadPlaces()
    } catch {/* fichier invalide : ignoré */}
  }, [loadPlaces])

  useEffect(() => { loadPlaces(); loadTraces(); loadCollections(); loadHistory() },
    [loadPlaces, loadTraces, loadCollections, loadHistory])

  // ── Sync place markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old markers
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key.startsWith('place-')) { marker.remove(); delete markersRef.current[key] }
    })

    // Add markers
    places.forEach(p => {
      const el = makePlaceEl(p.icon)
      // Clic droit sur un lieu enregistré → menu contextuel riche.
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation()
        setCtxMenu({ x: e.clientX, y: e.clientY, lat: p.lat, lng: p.lng, name: p.name })
      })
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 30 }).setHTML(`<div style="min-width:160px">
          <p style="font-weight:600;margin:0 0 4px">${p.name}</p>
          ${p.address ? `<p style="font-size:12px;color:#5f6368;margin:0 0 4px">${p.address}</p>` : ''}
          ${p.user_note ? `<p style="font-size:12px;font-style:italic;margin:0">${p.user_note}</p>` : ''}
        </div>`))
        .addTo(map)
      markersRef.current[`place-${p.id}`] = m
    })
  }, [places])

  // ── Route waypoint markers (A, B, C… par position) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.keys(markersRef.current).forEach(k => {
      if (k.startsWith('wp-')) { markersRef.current[k].remove(); delete markersRef.current[k] }
    })
    waypoints.forEach((wp, i) => {
      if (!wp) return
      const m = new maplibregl.Marker({ element: makeWaypointEl(String.fromCharCode(65 + i)) })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map)
      markersRef.current[`wp-${i}`] = m
    })
  }, [waypoints])

  // ── Fly to ────────────────────────────────────────────────────────────────────
  const flyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800 })
  }, [])

  // ── Sélection d'un lieu (ouvre le panneau d'infos + marqueur + recentrage) ─────
  const selectPlace = useCallback((r: SearchResult) => {
    setSelectedPlace(r)
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
    flyTo(lat, lng, 16)
    const map = mapRef.current
    if (map) {
      markersRef.current['selected']?.remove()
      const m = new maplibregl.Marker({ element: makePlaceEl('📍') }).setLngLat([lng, lat]).addTo(map)
      markersRef.current['selected'] = m
    }
  }, [flyTo])

  const clearSelectedPlace = useCallback(() => {
    setSelectedPlace(null)
    markersRef.current['selected']?.remove()
    delete markersRef.current['selected']
  }, [])

  // ── Exploration : recherche de POI par catégorie dans la vue courante ─────────
  // Un nouveau clic sur la catégorie active l'efface (bascule). Le rayon suit
  // l'emprise visible (distance centre → coin), borné [300 m ; 6 km].
  // `center` fourni (depuis le menu contextuel) → recherche autour de ce point et
  // recentre ; sans `center`, on utilise le centre de la vue (chips), avec bascule.
  const searchCategory = useCallback(async (chip: typeof POI_CHIPS[number], center?: { lat: number; lng: number }) => {
    const map = mapRef.current
    if (!map) return
    if (!center && activeCat === chip.key) {   // bascule : on masque (chips seulement)
      setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null)
      return
    }
    setActiveCat(chip.key); setPoiError(null); setPoiLoading(true)
    clearSelectedPlace()
    const mc = map.getCenter()
    const c = center ?? { lat: mc.lat, lng: mc.lng }
    const ne = map.getBounds().getNorthEast()
    const radius = Math.min(6000, Math.max(300, haversineM(c.lat, c.lng, ne.lat, ne.lng)))
    setPoiCenter({ lat: c.lat, lng: c.lng })
    if (center) flyTo(c.lat, c.lng)
    try {
      const found = await fetchNearbyPois(c.lat, c.lng, radius, chip.cats, 150)
      // Tri par distance au centre de recherche (les plus proches d'abord).
      found.sort((a, p) =>
        haversineM(c.lat, c.lng, a.lat, a.lng) - haversineM(c.lat, c.lng, p.lat, p.lng))
      setPois(found)
      if (found.length === 0) setPoiError(t('maps_poi_none', { defaultValue: 'Aucun résultat dans cette zone' }))
    } catch {
      setPois([])
      setPoiError(t('maps_poi_error', { defaultValue: 'Exploration indisponible' }))
    } finally {
      setPoiLoading(false)
    }
  }, [activeCat, clearSelectedPlace, flyTo, t])

  // Ouvre le panneau d'infos pour un POI (clic sur son marqueur).
  const selectPoi = useCallback((p: Poi) => {
    setSelectedPlace(poiToSearchResult(p))
    flyTo(p.lat, p.lng, Math.max(16, mapRef.current?.getZoom() ?? 16))
  }, [flyTo])

  // « À proximité » : recherche POI large autour d'un lieu (toutes catégories utiles).
  const exploreNearby = useCallback(async (lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return
    const cats = ['restaurant', 'cafe', 'bar', 'fast_food', 'hotel', 'supermarket', 'pharmacy',
      'atm', 'museum', 'attraction', 'park', 'cinema', 'transit', 'parking']
    setActiveCat('nearby'); setPoiError(null); setPoiLoading(true)
    setSelectedPlace(null)
    setPoiCenter({ lat, lng })
    flyTo(lat, lng, Math.min(16, mapRef.current?.getZoom() ?? 15))
    const ne = map.getBounds().getNorthEast()
    const radius = Math.min(3000, Math.max(300, haversineM(lat, lng, ne.lat, ne.lng)))
    try {
      const found = await fetchNearbyPois(lat, lng, radius, cats, 200)
      found.sort((a, b) => haversineM(lat, lng, a.lat, a.lng) - haversineM(lat, lng, b.lat, b.lng))
      setPois(found)
      if (found.length === 0) setPoiError(t('maps_poi_none', { defaultValue: 'Aucun résultat dans cette zone' }))
    } catch {
      setPois([]); setPoiError(t('maps_poi_error', { defaultValue: 'Exploration indisponible' }))
    } finally { setPoiLoading(false) }
  }, [flyTo, t])

  // ── Sync des marqueurs POI ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key.startsWith('poi-')) { marker.remove(); delete markersRef.current[key] }
    })
    pois.forEach(p => {
      const el = makePoiEl(p.icon || '📍')
      el.addEventListener('click', (e) => { e.stopPropagation(); selectPoi(p) })
      // Clic droit sur un POI → menu contextuel riche centré sur ce lieu.
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation()
        setCtxMenu({ x: e.clientX, y: e.clientY, lat: p.lat, lng: p.lng, name: p.name ?? undefined })
      })
      const m = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .addTo(map)
      markersRef.current[`poi-${p.osm_type}-${p.osm_id}`] = m
    })
  }, [pois, selectPoi])

  // « Itinéraire » depuis le panneau d'un lieu → en fait la destination (B) et
  // bascule sur l'onglet itinéraire.
  const routeToPlace = useCallback((lat: number, lng: number, label: string) => {
    // Le lieu devient la destination (dernier point).
    setWaypoints(wp => { const n = [...wp]; n[n.length - 1] = { lat, lng, label }; return n })
    setRoutePickMode(null)
    clearSelectedPlace()
    setTab('route')
  }, [clearSelectedPlace, setTab])

  // Changer d'onglet (via la nav de la sidebar) ferme le panneau d'infos du lieu
  // ET l'exploration par catégorie (sinon le panneau POI masquerait l'onglet).
  useEffect(() => {
    clearSelectedPlace()
    setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null)
    if (tab !== 'sketch') sketch.setTool('none')   // pas de dessin hors de l'onglet Croquis
  }, [tab, clearSelectedPlace])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save place from search ────────────────────────────────────────────────────
  const saveFromSearch = useCallback((r: SearchResult) => {
    setSaveModal({
      lat:  parseFloat(r.lat),
      lng:  parseFloat(r.lon),
      name: r.display_name.split(',')[0].trim(),
    })
    flyTo(parseFloat(r.lat), parseFloat(r.lon))
  }, [flyTo])

  // « Qu'y a-t-il ici ? » — géocodage inverse du point cliqué → panneau d'infos.
  const whatIsHere = useCallback(async (lat: number, lng: number) => {
    setCtxMenu(null)
    flyTo(lat, lng, Math.max(15, mapRef.current?.getZoom() ?? 15))
    try {
      const res = await fetch(buildNominatimReverseUrl(lat, lng))
      if (!res.ok) return
      const raw = await res.json()
      const r = mapNominatimResult(raw)
      setSelectedPlace({ ...r, lat: String(lat), lon: String(lng) })
    } catch {/* indisponible : silencieux */}
  }, [flyTo])

  // Copie « lat, lng » dans le presse-papier.
  const copyCoords = useCallback((lat: number, lng: number) => {
    navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`).catch(() => {})
    setCtxMenu(null)
  }, [])

  // Lien de partage profond `?ll=lat,lng` : ouvre le lieu à l'arrivée sur /maps.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (!mapReady || deepLinkDone.current) return
    const params = new URLSearchParams(window.location.search)
    const ll = params.get('ll')
    if (ll && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(ll)) {
      deepLinkDone.current = true
      const [la, ln] = ll.split(',').map(Number)
      whatIsHere(la, ln)
    }
  }, [mapReady, whatIsHere])

  // Deep link `?dest=<adresse>`: another module — a meeting invitation, say —
  // asks for the way to a place it only knows by name. Geocode that text, make
  // it the destination and open the route tab, exactly as "Itinéraire" does
  // from a place panel. The tab opens either way: an address nobody can resolve
  // still leaves the reader in front of the route form rather than nowhere.
  const destLinkDone = useRef(false)
  useEffect(() => {
    if (destLinkDone.current) return
    const dest = new URLSearchParams(window.location.search).get('dest')?.trim()
    if (!dest) return
    destLinkDone.current = true
    setTab('route')
    void (async () => {
      try {
        const res = await fetch(buildNominatimSearchUrl(dest, 1))
        if (!res.ok) return
        const rows = (await res.json()) as Record<string, unknown>[]
        if (!rows.length) return
        const r = mapNominatimResult(rows[0])
        routeToPlace(parseFloat(r.lat), parseFloat(r.lon), r.display_name.split(',')[0].trim() || dest)
      } catch {
        /* address not resolvable: the route tab is open, the guest types it */
      }
    })()
    // Deliberately NOT waiting for the map: opening the route panel and filling
    // the destination is state, not drawing. The reader sees the form at once
    // and the map catches up.
  }, [routeToPlace, setTab])

  // ── Save place from right-click ───────────────────────────────────────────────
  const saveFromContextMenu = useCallback(async (lat: number, lng: number) => {
    let defaultName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    try {
      const res = await fetch(buildNominatimReverseUrl(lat, lng))
      if (res.ok) {
        const data: { display_name?: string } = await res.json()
        if (data.display_name) defaultName = data.display_name.split(',')[0].trim()
      }
    } catch {/* keep coordinates as name */}
    setSaveModal({ lat, lng, name: defaultName })
  }, [])

  const confirmSave = useCallback(async (name: string, note: string) => {
    if (!saveModal) return
    try {
      await api.post('/maps/places', {
        name,
        lat:       saveModal.lat,
        lng:       saveModal.lng,
        user_note: note || null,
        icon:      '📍',
      })
      setSaveModal(null)
      await loadPlaces()
      setTab('places')
    } catch {/* ignore */}
  }, [saveModal, loadPlaces])

  const deletePlace = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/places/${id}`)
      setPlaces(ps => ps.filter(p => p.id !== id))
      const key = `place-${id}`
      markersRef.current[key]?.remove()
      delete markersRef.current[key]
    } catch {/* ignore */}
  }, [])

  // ── GPX upload ────────────────────────────────────────────────────────────────
  const uploadGpx = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      await api.post('/maps/gpx', buf, {
        headers: { 'Content-Type': 'application/gpx+xml' },
        params:  { name: file.name.replace('.gpx', '') },
      })
      await loadTraces()
      setTab('gpx')
    } catch {/* ignore */} finally {
      setUploading(false)
    }
  }, [loadTraces])

  // ── Enregistrement d'une trace depuis le GPS (geolocation) ─────────────────────
  const updateRecLine = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const coords = recPtsRef.current.map(p => [p.lng, p.lat] as [number, number])
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }
    const src = map.getSource('rec-line') as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(data as Parameters<maplibregl.GeoJSONSource['setData']>[0])
  }, [])

  const startRecording = useCallback(() => {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return
    recPtsRef.current = []
    recStartRef.current = Date.now()
    setRecording(true)
    setRecStats({ points: 0, dist: 0, elapsed: 0 })
    setTab('gpx')

    const draw = () => {
      if (!map.getSource('rec-line')) {
        map.addSource('rec-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'rec-line', type: 'line', source: 'rec-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#d93025', 'line-width': 4, 'line-opacity': 0.9 },
        })
        lineIdsRef.current.add('rec-line')
      }
    }
    if (map.isStyleLoaded()) draw(); else map.once('load', draw)

    recWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const c = pos.coords
        const pts = recPtsRef.current
        const prev = pts[pts.length - 1]
        pts.push({ lng: c.longitude, lat: c.latitude, ele: c.altitude, time: new Date().toISOString() })
        updateRecLine()
        const added = prev ? haversineM(prev.lat, prev.lng, c.latitude, c.longitude) : 0
        setRecStats(s => ({
          points: pts.length,
          dist: (s?.dist ?? 0) + added,
          elapsed: Math.round((Date.now() - recStartRef.current) / 1000),
        }))
        map.easeTo({ center: [c.longitude, c.latitude], duration: 500 })
      },
      () => {/* permission refusée : on laisse l'utilisateur arrêter */},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )
    // Met à jour le chrono même sans nouveau point.
    recTimerRef.current = setInterval(() => {
      setRecStats(s => (s ? { ...s, elapsed: Math.round((Date.now() - recStartRef.current) / 1000) } : s))
    }, 1000)
  }, [setTab, updateRecLine])

  const stopRecording = useCallback(async (save: boolean) => {
    if (recWatchRef.current != null) { navigator.geolocation?.clearWatch(recWatchRef.current); recWatchRef.current = null }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    const map = mapRef.current
    if (map) {
      if (map.getLayer('rec-line')) map.removeLayer('rec-line')
      if (map.getSource('rec-line')) map.removeSource('rec-line')
      lineIdsRef.current.delete('rec-line')
    }
    const pts = recPtsRef.current
    setRecording(false); setRecStats(null)

    if (save && pts.length >= 2) {
      const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))
      const name = `Trace ${new Date().toLocaleString('fr-FR')}`
      const seg = pts.map(p =>
        `<trkpt lat="${p.lat}" lon="${p.lng}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}<time>${p.time}</time></trkpt>`,
      ).join('')
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kubuno Maps"><trk><name>${esc(name)}</name><trkseg>${seg}</trkseg></trk></gpx>`
      setUploading(true)
      try {
        await api.post('/maps/gpx', gpx, {
          headers: { 'Content-Type': 'application/gpx+xml' },
          params:  { name, activity_type: 'other' },
        })
        await loadTraces()
      } catch {/* ignore */} finally { setUploading(false) }
    }
    recPtsRef.current = []
  }, [loadTraces])

  const showGpx = useCallback(async (id: string, name?: string) => {
    const map = mapRef.current
    if (!map) return
    // Profil d'élévation + stats détaillées (endpoint dédié).
    api.get<{ track: TrackData }>(`/maps/gpx/${id}/track`)
      .then(({ data }) => setTrackData({ name: name ?? 'Trace', data: data.track }))
      .catch(() => {/* pas de profil : on garde juste le tracé */})
    try {
      const { data } = await api.get<ArrayBuffer>(`/maps/gpx/${id}/download`, {
        responseType: 'arraybuffer',
      })
      const text    = new TextDecoder().decode(data)
      const parser  = new DOMParser()
      const doc     = parser.parseFromString(text, 'application/xml')
      const trkpts  = Array.from(doc.querySelectorAll('trkpt'))
      if (!trkpts.length) return
      const coords = trkpts.map(pt => [
        parseFloat(pt.getAttribute('lon') ?? '0'),
        parseFloat(pt.getAttribute('lat') ?? '0'),
      ] as [number, number])

      const id2 = `gpx-${id}`
      if (map.getLayer(id2)) map.removeLayer(id2)
      if (map.getSource(id2)) map.removeSource(id2)

      const addLine = () => {
        map.addSource(id2, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        })
        map.addLayer({
          id: id2,
          type: 'line',
          source: id2,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:  { 'line-color': '#1a73e8', 'line-width': 3, 'line-opacity': 0.85 },
        })
        const b = new maplibregl.LngLatBounds(coords[0], coords[0])
        coords.forEach(c => b.extend(c))
        map.fitBounds(b, { padding: 40, duration: 800 })
      }
      if (map.isStyleLoaded()) addLine()
      else map.once('load', addLine)

      lineIdsRef.current.add(id2)
    } catch {/* ignore */}
  }, [])

  // Exporte la trace affichée en GeoJSON (LineString avec élévations).
  const exportTrackGeoJSON = useCallback(() => {
    if (!trackData) return
    const coords = trackData.data.points.map(p => (p.ele != null ? [p.lng, p.lat, p.ele] : [p.lng, p.lat]))
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: trackData.name,
          distance_m: trackData.data.distance_meters,
          gain_m: trackData.data.elevation_gain,
          loss_m: trackData.data.elevation_loss,
        },
        geometry: { type: 'LineString', coordinates: coords },
      }],
    }
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${trackData.name.replace(/[^\w-]+/g, '_')}.geojson`; a.click()
    URL.revokeObjectURL(url)
  }, [trackData])

  const deleteGpx = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/gpx/${id}`)
      setTraces(ts => ts.filter(t => t.id !== id))
      const map = mapRef.current
      const id2 = `gpx-${id}`
      if (map) {
        if (map.getLayer(id2)) map.removeLayer(id2)
        if (map.getSource(id2)) map.removeSource(id2)
      }
      lineIdsRef.current.delete(id2)
    } catch {/* ignore */}
  }, [])

  // ── Route ─────────────────────────────────────────────────────────────────────
  // Définit le point A (0) ou B (1) de l'itinéraire, avec un libellé optionnel
  // (issu de la recherche d'adresse).
  const setWaypointAt = useCallback((index: number, lat: number, lng: number, label?: string) => {
    setWaypoints(wp => { const n = [...wp]; n[index] = { lat, lng, label }; return n })
    setRoutePickMode(null)
  }, [])

  const clearWaypointAt = useCallback((index: number) => {
    setWaypoints(wp => { const n = [...wp]; n[index] = null; return n })
  }, [])

  // Inserts an empty stop right before the destination.
  const addStop = useCallback(() => {
    setWaypoints(wp => { const n = [...wp]; n.splice(Math.max(1, n.length - 1), 0, null); return n })
  }, [])

  // Removes a stop (always keeps at least 2 points).
  const removeStop = useCallback((index: number) => {
    setWaypoints(wp => (wp.length <= 2 ? wp : wp.filter((_, i) => i !== index)))
  }, [])

  // Moves a point to another position (drag-and-drop in the route panel).
  const reorderStop = useCallback((from: number, to: number) => {
    setWaypoints(wp => {
      if (from === to || from < 0 || to < 0 || from >= wp.length || to >= wp.length) return wp
      const n = [...wp]; const [moved] = n.splice(from, 1); n.splice(to, 0, moved); return n
    })
  }, [])

  // Swaps the origin and the destination (stops keep their order).
  const swapEnds = useCallback(() => {
    setWaypoints(wp => { const n = [...wp]; [n[0], n[n.length - 1]] = [n[n.length - 1], n[0]]; return n })
  }, [])

  // Retire tous les calques de tracé d'itinéraire (route-*).
  const clearRouteLines = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    Array.from(lineIdsRef.current).forEach(id => {
      if (id.startsWith('route-')) {
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
        lineIdsRef.current.delete(id)
      }
    })
  }, [])

  // Click / hover handlers attached to the alternative lines (removed with them).
  const altHandlersRef = useRef<Record<string, { click: () => void; enter: () => void; leave: () => void }>>({})

  // Draws the routes: alternatives in grey (below, clickable) + selected in
  // blue (above). `dashed` = plane mode (great circle, own layer id).
  const drawRoutes = useCallback((results: RouteResult[], selIdx: number, dashed: boolean, onPickAlt: (i: number) => void) => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      Array.from(lineIdsRef.current).forEach(id => {
        if (id.startsWith('route-')) {
          const h = altHandlersRef.current[id]
          if (h) { map.off('click', id, h.click); map.off('mouseenter', id, h.enter); map.off('mouseleave', id, h.leave); delete altHandlersRef.current[id] }
          if (map.getLayer(id)) map.removeLayer(id)
          if (map.getSource(id)) map.removeSource(id)
          lineIdsRef.current.delete(id)
        }
      })
      results.forEach((r, i) => {
        if (i === selIdx) return
        const g = r.geometry
        if (!g || !Array.isArray(g.coordinates) || !g.coordinates.length) return
        const id = `route-alt-${i}`
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: { idx: i }, geometry: g } })
        map.addLayer({
          id, type: 'line', source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:  { 'line-color': '#9aa0a6', 'line-width': 5, 'line-opacity': 0.7, ...(dashed ? { 'line-dasharray': [2, 2] } : {}) },
        })
        lineIdsRef.current.add(id)
        // An alternative is selectable from the map as well as from the panel.
        const h = {
          click: () => onPickAlt(i),
          enter: () => { map.getCanvas().style.cursor = 'pointer' },
          leave: () => { map.getCanvas().style.cursor = '' },
        }
        altHandlersRef.current[id] = h
        map.on('click', id, h.click); map.on('mouseenter', id, h.enter); map.on('mouseleave', id, h.leave)
      })
      const sel = results[selIdx]
      if (sel?.geometry && Array.isArray(sel.geometry.coordinates) && sel.geometry.coordinates.length) {
        const id = dashed ? 'route-plane' : 'route-line'
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: sel.geometry } })
        map.addLayer({
          id, type: 'line', source: id,
          layout: { 'line-cap': dashed ? 'butt' : 'round', 'line-join': 'round' },
          paint:  dashed
            ? { 'line-color': '#1a73e8', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 2] }
            : { 'line-color': '#1a73e8', 'line-width': 6, 'line-opacity': 0.9 },
        })
        lineIdsRef.current.add(id)
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [])

  // Cadre la vue sur une géométrie d'itinéraire.
  const fitToRoute = useCallback((g: RouteGeometry | null) => {
    const map = mapRef.current
    if (!map || !g || !Array.isArray(g.coordinates) || !g.coordinates.length) return
    const b = new maplibregl.LngLatBounds(g.coordinates[0], g.coordinates[0])
    g.coordinates.forEach(c => b.extend(c as [number, number]))
    map.fitBounds(b, { padding: 60, duration: 800 })
  }, [])

  // Route computation (single profile with alternatives, "recommended"
  // multi-mode view, plane great circle, avoid options) lives in the hook.
  const route = useRouteModes({
    waypoints,
    lang:       i18n.language || 'fr',
    fitToRoute,
    onEmpty:    clearRouteLines,
    messages:   { none: t('maps_route_none'), unavailable: t('maps_route_service_unavailable') },
  })
  const { setSelected: selectRoute } = route

  // Live navigation (turn-by-turn guidance) on the selected route.
  const nav = useNavigation(mapRef, route.results[route.selected] ?? null, {
    onOffRoute: (lat, lng) => setWaypoints(wp => { const n = [...wp]; n[0] = { lat, lng }; return n }),
  })

  // Redraw when the result set, the selection or the mode changes.
  useEffect(() => {
    drawRoutes(route.results, route.selected, route.mode === 'plane', selectRoute)
  }, [route.results, route.selected, route.mode, drawRoutes, selectRoute])

  const clearRoute = useCallback(() => {
    setWaypoints([null, null])
    route.reset()
    clearRouteLines()
  }, [clearRouteLines, route.reset])   // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the panel from its cross: back to the bare map, nothing drawn.
  const closeRoutePanel = useCallback(() => { clearRoute(); setTab('search') }, [clearRoute, setTab])

  // Share link `?route=lat,lng;lat,lng[;…]&mode=…` (QR / "copy link" of the
  // route panel): reopen the panel with those points on arrival.
  const routeLinkDone = useRef(false)
  useEffect(() => {
    if (routeLinkDone.current) return
    const parsed = parseRouteLink(window.location.search)
    if (!parsed) return
    routeLinkDone.current = true
    setWaypoints(parsed.waypoints.map(p => ({ lat: p.lat, lng: p.lng })))
    if (parsed.mode && parsed.mode !== 'transit') route.setMode(parsed.mode)
    setTab('route')
  }, [route.setMode, setTab])

  // ── Couches : type de fond + calques + bascules ──
  // Changer de fond recharge le style ; on réapplique projection, libellés,
  // calques actifs et le tracé d'itinéraire une fois le nouveau style chargé.
  const switchBase = (b: BaseMap) => {
    setBaseMap(b)
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleFor(b))
    map.once('styledata', () => {
      applyProjection(map, globe)
      applyLabels(map, b, showLabels)
      if (cycle)    applyCycle(map, true)
      if (relief)   applyRelief(map, true)
      if (transit)  applyTransit(map, true)
      if (precip)   applyPrecip(map, true)
      if (terrain3d) applyTerrain3D(map, true)
      imports.forEach(im => addImportLayer(map, im.id, importDataRef.current[im.id]))
      if (route.results.length) drawRoutes(route.results, route.selected, route.mode === 'plane', selectRoute)
    })
  }
  const toggleGlobe = () => {
    const next = !globe; setGlobe(next)
    if (mapRef.current) applyProjection(mapRef.current, next)
  }
  const toggleLabels = () => {
    const next = !showLabels; setShowLabels(next)
    if (mapRef.current) applyLabels(mapRef.current, baseMap, next)
  }
  const toggleCycle = () => {
    const next = !cycle; setCycle(next)
    if (mapRef.current) applyCycle(mapRef.current, next)
  }
  const toggleRelief = () => {
    const next = !relief; setRelief(next)
    if (mapRef.current) applyRelief(mapRef.current, next)
  }
  const toggleTransit = () => {
    const next = !transit; setTransit(next)
    if (mapRef.current) applyTransit(mapRef.current, next)
  }
  const togglePrecip = () => {
    const next = !precip; setPrecip(next)
    if (mapRef.current) applyPrecip(mapRef.current, next)
  }
  const toggleTerrain3d = () => {
    const next = !terrain3d; setTerrain3d(next)
    if (mapRef.current) applyTerrain3D(mapRef.current, next)
  }

  // Importer un fichier GeoJSON/KML et l'ajouter comme calque (+ cadrage).
  const importFile = useCallback(async (file: File) => {
    const map = mapRef.current
    if (!map) return
    try {
      const text = await file.text()
      const data = file.name.toLowerCase().endsWith('.kml')
        ? kmlToGeoJSON(text)
        : JSON.parse(text)
      const id = `imp${importSeq.current++}`
      importDataRef.current[id] = data
      addImportLayer(map, id, data)
      setImports(prev => [...prev, { id, name: file.name }])
      const b = geoJsonBounds(data)
      if (b) map.fitBounds(b, { padding: 60, duration: 800 })
    } catch { /* fichier invalide : ignoré */ }
  }, [])

  const removeImport = useCallback((id: string) => {
    if (mapRef.current) removeImportLayer(mapRef.current, id)
    delete importDataRef.current[id]
    setImports(prev => prev.filter(im => im.id !== id))
  }, [])

  // ── Hors-ligne : télécharge les tuiles de la zone visible dans le cache ─────────
  const refreshCacheCount = useCallback(() => { cachedTileCount().then(setCachedTiles) }, [])

  const downloadVisibleArea = useCallback(async () => {
    const map = mapRef.current
    if (!map || dlProgress) return
    const b = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const z = Math.round(map.getZoom())
    // De (zoom−1) à (zoom+2), borné [3 ; 17] — compromis couverture / quantité.
    const minZ = Math.max(3, z - 1), maxZ = Math.min(17, z + 2)
    setDlProgress({ done: 0, total: 1 })
    await downloadArea(bbox, minZ, maxZ, (done, total) => setDlProgress({ done, total }))
    setDlProgress(null)
    refreshCacheCount()
  }, [dlProgress, refreshCacheCount])

  const clearTiles = useCallback(async () => {
    await clearOfflineCache()
    refreshCacheCount()
  }, [refreshCacheCount])

  // Compte initial + suivi de l'état en ligne / hors-ligne.
  useEffect(() => {
    refreshCacheCount()
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [refreshCacheCount])

  // Contraste élevé : filtre CSS appliqué au conteneur de la carte.
  useEffect(() => {
    const el = mapDivRef.current
    if (el) el.style.filter = highContrast ? 'contrast(1.3) saturate(1.25)' : ''
  }, [highContrast])

  // ── Raccourcis clavier (accessibilité) ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return  // ne pas gêner la saisie
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case '?': setShowShortcuts(s => !s); break
        case 'l': case 'L': setLayersOpen(o => !o); break
        case 's': case 'S': setTab('search'); break
        case 'p': case 'P': setTab('places'); break
        case 'r': case 'R': setTab('route'); break
        case 'g': case 'G': setTab('gpx'); break
        case 'd': case 'D': setTab('sketch'); break
        case '+': case '=': mapRef.current?.zoomIn(); break
        case '-': case '_': mapRef.current?.zoomOut(); break
        case 'Escape': setShowShortcuts(false); setLayersOpen(false); clearSelectedPlace(); break
        default: return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, clearSelectedPlace])

  // Halo atmosphérique par astre : Terre bleutée, Lune sans atmosphère, Mars
  // poussière rosée. (MapLibre 5 `setSky` + atmosphere-blend sur le globe.)
  const applyWorldSky = useCallback((map: maplibregl.Map, id: string) => {
    try {
      if (id === 'moon') {
        map.setSky({ 'atmosphere-blend': 0, 'sky-color': '#05060a', 'horizon-color': '#101216', 'fog-color': '#0a0c10' })
      } else if (id === 'mars') {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 5, 0] as unknown as number, 'sky-color': '#d9a07a', 'horizon-color': '#e7b48a', 'fog-color': '#caa07e' })
      } else {
        map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 6, 0] as unknown as number, 'sky-color': '#5a9be0', 'horizon-color': '#bcd9f5', 'fog-color': '#dfecfb' })
      }
    } catch { /* setSky indispo : ignore */ }
  }, [])

  // Étiquettes de repères de surface (cratères/mers/monts) sur Lune & Mars.
  const applyBodyLabels = useCallback((map: maplibregl.Map, id: string) => {
    const feats = (id === 'moon' ? MOON_FEATURES : id === 'mars' ? MARS_FEATURES : [])
      .map(f => ({ type: 'Feature' as const, properties: { name: f.name }, geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] } }))
    const sid = 'body-labels'
    if (map.getLayer(`${sid}-dot`)) map.removeLayer(`${sid}-dot`)
    if (map.getLayer(sid)) map.removeLayer(sid)
    if (map.getSource(sid)) map.removeSource(sid)
    if (!feats.length) return
    map.addSource(sid, { type: 'geojson', data: { type: 'FeatureCollection', features: feats } })
    map.addLayer({ id: `${sid}-dot`, type: 'circle', source: sid, paint: { 'circle-radius': 2.5, 'circle-color': '#ffd24a', 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(0,0,0,.5)' } })
    map.addLayer({
      id: sid, type: 'symbol', source: sid,
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.5], 'text-allow-overlap': false },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.4 },
    })
  }, [])

  // ── Mondes / cosmos : voyager vers un autre astre (Lune, Mars…) ────────────────
  // Transition cinématique : fondu spatial → changement de carte → fondu sortant.
  const travelTo = useCallback((w: World) => {
    const map = mapRef.current
    if (!map) return
    setCosmosOpen(false); cosmosAutoRef.current = true
    setWarping(true)
    clearSelectedPlace(); clearRouteLines()
    window.setTimeout(() => {
      setWorldId(w.id)
      const after = () => {
        applyProjection(map, globe)
        applyWorldSky(map, w.id)
        if (w.id !== 'earth') applyBodyLabels(map, w.id)
        const center = (w.id === 'earth' ? [2.3522, 48.8566] : (w.center ?? [0, 0])) as [number, number]
        const z = w.id === 'earth' ? 4 : (w.zoom ?? 2)
        // Arrivée naturelle : le globe apparaît petit (dézoomé) puis on zoome dessus.
        map.jumpTo({ center, zoom: 0.8 })
        map.flyTo({ center, zoom: z, duration: 2600, essential: true })
        window.setTimeout(() => setWarping(false), 950)
      }
      map.setStyle(w.id === 'earth' ? styleFor(baseMap) : w.style!())
      map.once('styledata', after)
    }, 480)
  }, [baseMap, globe, clearSelectedPlace, clearRouteLines, applyWorldSky])

  // Ouvre le cosmos avec un bref fondu spatial (transition naturelle map→3D).
  const openCosmos = useCallback(() => {
    cosmosAutoRef.current = true
    setWarping(true); setCosmosOpen(true)
    window.setTimeout(() => setWarping(false), 520)
  }, [])

  const closeCosmos = useCallback(() => {
    setCosmosOpen(false); cosmosAutoRef.current = true
    if (worldId === 'earth' && mapRef.current && mapRef.current.getZoom() < 2.4) {
      mapRef.current.easeTo({ zoom: 3.5, duration: 800 })
    }
  }, [worldId])

  // Ouvre automatiquement le cosmos quand on dézoome à fond (façon « sortir dans l'espace »).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onZoom = () => {
      const z = map.getZoom()
      if (z > 2.6) cosmosAutoRef.current = false           // réarme une fois revenu
      else if (z <= 1.6 && !cosmosAutoRef.current && !cosmosOpen) {
        openCosmos()
      }
    }
    map.on('zoom', onZoom)
    return () => { map.off('zoom', onZoom) }
  }, [mapReady, cosmosOpen, openCosmos])

  // ── Cursor during route pick ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = routePickMode !== null ? 'crosshair' : ''
  }, [routePickMode])

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  // Recentre sur la position de l'utilisateur (bouton « ma position »).
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => flyTo(pos.coords.latitude, pos.coords.longitude, 15),
      () => { /* permission refusée / indisponible : silencieux */ },
    )
  }

  return (
    <div className={`relative h-full overflow-hidden ${globe ? 'maps-space' : ''}`}
      style={globe ? undefined : { background: '#e8eaed' }}>
      {/* Carte plein écran (moteur MapLibre GL — tuiles vectorielles OpenFreeMap, projection globe).
          NB : on utilise w-full/h-full et NON `absolute inset-0` car maplibre-gl.css force
          `.maplibregl-map { position: relative }`, ce qui écraserait le positionnement absolu
          et ferait retomber le canvas à sa hauteur par défaut (300px → carte invisible). */}
      <div ref={mapDivRef} className="w-full h-full no-print" />

      {/* ── Rail gauche pleine hauteur : barre de recherche PERMANENTE + contenu ──
          La barre de recherche reste toujours visible (façon Google) ; le panneau
          (lieu / résultats / onglet) occupe toute la hauteur sous la barre. */}
      <div className={`absolute z-[1100] flex flex-col gap-2 min-h-0 transition-transform duration-200 ${
        tab === 'route' && !selectedPlace && !activeCat ? 'maps-rail-route' : 'no-print'} ${
        selectedPlace
          // Place open: the rail is the full-height white panel, flush with the map
          // edges; the search pill floats over the hero photo (cf. .maps-rail-place).
          ? `maps-rail-place left-0 top-0 bottom-0 w-[400px] max-w-[100vw] bg-surface-0 shadow-xl ${panelCollapsed ? '-translate-x-full' : ''}`
          : 'left-3 top-3 bottom-3 w-[384px] max-w-[calc(100vw-24px)]'}`}>
        <MapsSearchBar
          mapRef={mapRef} mapReady={mapReady} history={history}
          onSelect={selectPlace} onSave={saveFromSearch}
          placeTitle={selectedPlace ? placeDetails(selectedPlace).title : undefined}
          onClear={clearSelectedPlace}
          onDirections={() => selectedPlace
            ? routeToPlace(parseFloat(selectedPlace.lat), parseFloat(selectedPlace.lon), placeDetails(selectedPlace).title)
            : setTab('route')}
          onOpenHistory={() => setTab('places')}
          onHistoryChanged={loadHistory}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {selectedPlace ? (
            <MapsPlacePanel
              place={selectedPlace}
              saved={places.some(p => Math.abs(p.lat - parseFloat(selectedPlace.lat)) < 1e-4 && Math.abs(p.lng - parseFloat(selectedPlace.lon)) < 1e-4)}
              onClose={clearSelectedPlace}
              onRouteTo={routeToPlace}
              onSave={saveFromSearch}
              onNearby={(lat, lng) => exploreNearby(lat, lng)}
            />
          ) : activeCat ? (
            <PoiResultsPanel
              title={activeCat === 'nearby'
                ? t('maps_nearby', { defaultValue: 'À proximité' })
                : t(POI_CHIPS.find(c => c.key === activeCat)?.labelKey || '', { defaultValue: POI_CHIPS.find(c => c.key === activeCat)?.fallback || '' })}
              emoji={activeCat === 'nearby' ? '📍' : (POI_CHIPS.find(c => c.key === activeCat)?.emoji || '📍')}
              pois={pois}
              center={poiCenter}
              loading={poiLoading}
              error={poiError}
              onSelect={selectPoi}
              onClose={() => { setActiveCat(null); setPois([]); setPoiError(null); setPoiCenter(null) }}
            />
          ) : tab !== 'search' ? (
            <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col h-full min-h-0">
              {/* The route panel lays out its own rows edge to edge (no padding). */}
              <div className={`overflow-y-auto flex-1 min-h-0 ${tab === 'route' ? '' : 'p-3'}`}>
                {tab === 'places' && (
                  <MapsPlacesPanel
                    places={places} collections={collections} history={history}
                    onFly={(lat, lng) => flyTo(lat, lng)}
                    onDelete={deletePlace}
                    onUpdate={updatePlace}
                    onCreateCollection={createCollection}
                    onDeleteCollection={deleteCollection}
                    onExport={exportPlaces}
                    onImport={importPlaces}
                    onClearHistory={clearHistory}
                  />
                )}
                {tab === 'gpx'    && <GpxPanel traces={traces} onShow={showGpx} onDelete={deleteGpx} onUpload={uploadGpx}
                  recording={recording} recStats={recStats} onStartRec={startRecording} onStopRec={stopRecording} />}
                {tab === 'route'  && (
                  <MapsRoutePanel
                    route={route}
                    waypoints={waypoints}
                    history={history}
                    onSetWaypoint={setWaypointAt}
                    onClearWaypoint={clearWaypointAt}
                    onPickOnMap={(i) => setRoutePickMode(i)}
                    onAddStop={addStop}
                    onRemoveStop={removeStop}
                    onReorder={reorderStop}
                    onSwap={swapEnds}
                    onClearAll={clearRoute}
                    onClose={closeRoutePanel}
                    onStartNav={() => nav.start(false)}
                    onSimulateNav={() => nav.start(true)}
                  />
                )}
                {tab === 'sketch' && <MapsSketchPanel s={sketch} allowSharing={sketchSharingAllowed} />}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── HeaderActions flottant (plein écran) : rectangle arrondi sur la carte ── */}
      <div className="absolute top-3 right-3 z-[1110] bg-surface-0 rounded-2xl shadow-md border border-border px-1 flex items-center no-print">
        <HeaderActions compact />
      </div>

      {/* ── Category chips (top) — hidden on mobile (no room) and absent when
             the administrator disabled POI search. ── */}
      {poiEnabled && (
      <div className={`absolute top-4 right-[320px] z-[1090] hidden sm:flex transition-[left] duration-200 ${railOpen ? 'left-[416px]' : 'left-[400px]'} flex-col items-start gap-1 overflow-hidden no-print`}>
        <MapsCategoryChips
          chips={POI_CHIPS} activeKey={activeCat}
          count={pois.length} loading={poiLoading} error={poiError}
          onSelect={searchCategory}
        />
      </div>
      )}

      {/* Bandeau de sélection d'un point d'itinéraire sur la carte */}
      {routePickMode !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-primary rounded-lg px-4 py-2 shadow-lg flex items-center gap-3 text-sm">
          <ChevronRight size={16} className="text-primary" />
          <span>{t('maps_pick_point', { point: String.fromCharCode(65 + routePickMode), defaultValue: `Cliquez pour placer le point ${String.fromCharCode(65 + routePickMode)}` })}</span>
          <button onClick={() => setRoutePickMode(null)} className="text-text-tertiary hover:text-text-primary"><X size={15} /></button>
        </div>
      )}

      {/* ── Contrôles bas-droite : cosmos + aide + localisation + zoom ── */}
      <div className="absolute bottom-6 right-4 z-[1100] flex flex-col items-end gap-3 no-print">
        <button onClick={openCosmos}
          title={t('maps_cosmos', { defaultValue: 'Système solaire' })}
          aria-label={t('maps_cosmos', { defaultValue: 'Système solaire' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <Orbit size={18} />
        </button>
        <button onClick={() => setShowShortcuts(true)} title={t('maps_shortcuts', { defaultValue: 'Raccourcis clavier (?)' })}
          aria-label={t('maps_shortcuts', { defaultValue: 'Raccourcis clavier' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <HelpCircle size={18} />
        </button>
        <button onClick={locate} title={t('maps_locate', { defaultValue: 'Ma position' })}
          aria-label={t('maps_locate', { defaultValue: 'Ma position' })}
          className="w-10 h-10 rounded-lg bg-surface-0 border border-border shadow-md flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors">
          <Locate size={18} />
        </button>
        <div className="flex flex-col bg-surface-0 rounded-lg border border-border shadow-md overflow-hidden">
          <button onClick={() => mapRef.current?.zoomIn()} title={t('maps_zoom_in', { defaultValue: 'Zoom avant' })}
            className="w-10 h-10 flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors"><Plus size={18} /></button>
          <div className="h-px bg-border mx-1.5" />
          <button onClick={() => mapRef.current?.zoomOut()} title={t('maps_zoom_out', { defaultValue: 'Zoom arrière' })}
            className="w-10 h-10 flex items-center justify-center text-text-secondary hover:bg-surface-1 transition-colors"><Minus size={18} /></button>
        </div>
      </div>

      {/* ── Layers control (bottom-left): basemap thumbnail + panel ── */}
      {/* Bottom-left layers control: slides right of the place rail while it is open. */}
      <div className={`absolute bottom-6 z-[1100] no-print transition-[left] duration-200 ${railOpen ? 'left-[416px]' : 'left-3'}`}>
        {layersOpen && (
          <div className="absolute bottom-0 left-[84px]">
            <MapsLayersPanel
              baseMap={baseMap}      onBaseMap={switchBase}
              showLabels={showLabels} onToggleLabels={toggleLabels}
              globe={globe}           onToggleGlobe={toggleGlobe}
              cycle={cycle}           onToggleCycle={toggleCycle}
              relief={relief}         onToggleRelief={toggleRelief}
              transit={transit}       onToggleTransit={toggleTransit}
              precip={precip}         onTogglePrecip={togglePrecip}
              terrain3d={terrain3d}   onToggleTerrain3d={toggleTerrain3d}
              imports={imports}       onImport={importFile} onRemoveImport={removeImport}
              online={online}         cachedTiles={cachedTiles} dlProgress={dlProgress}
              onDownloadArea={downloadVisibleArea} onClearTiles={clearTiles}
              highContrast={highContrast} onToggleContrast={() => setHighContrast(c => !c)}
              onClose={() => setLayersOpen(false)}
            />
          </div>
        )}
        <MapsLayersButton
          baseMap={baseMap} mapRef={mapRef} mapReady={mapReady} online={online}
          open={layersOpen} onToggle={() => setLayersOpen(o => !o)}
        />
      </div>

      {/* Bandeau hors-ligne */}
      {!online && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1180] flex items-center gap-1.5 bg-amber-500 text-white rounded-full px-3 py-1 text-xs font-medium shadow-lg no-print">
          <WifiOff size={13} /> {t('maps_offline_banner', { defaultValue: 'Hors-ligne — tuiles en cache uniquement' })}
        </div>
      )}

      {/* Aide : raccourcis clavier */}
      {showShortcuts && (
        <div className="absolute inset-0 z-[1300] flex items-center justify-center bg-black/30 no-print" onClick={() => setShowShortcuts(false)}>
          <div className="bg-surface-0 rounded-2xl shadow-2xl border border-border w-[360px] max-w-[calc(100vw-24px)] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5"><Keyboard size={15} /> {t('maps_shortcuts', { defaultValue: 'Raccourcis clavier' })}</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-text-tertiary hover:text-text-primary"><X size={17} /></button>
            </div>
            <div className="p-4 flex flex-col gap-1.5 text-xs">
              {[
                ['S', t('maps_tab_search', { defaultValue: 'Recherche' })],
                ['P', t('maps_tab_places', { defaultValue: 'Lieux' })],
                ['R', t('maps_tab_route', { defaultValue: 'Itinéraire' })],
                ['G', 'GPX'],
                ['D', t('maps_tab_sketch', { defaultValue: 'Croquis' })],
                ['L', t('maps_layers_button', { defaultValue: 'Calques' })],
                ['+ / −', t('maps_zoom_in', { defaultValue: 'Zoom' })],
                ['Échap', t('common_close', { defaultValue: 'Fermer' })],
                ['?', t('maps_shortcuts', { defaultValue: 'Cette aide' })],
              ].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-text-secondary">{label}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[11px] font-mono text-text-primary">{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vue « système solaire » 3D (cosmos) */}
      {cosmosOpen && (
        <MapsCosmos3D currentId={worldId} onTravel={travelTo} onClose={closeCosmos} />
      )}

      {/* Transition cinématique (fondu spatial) entre deux mondes */}
      <div className={`absolute inset-0 z-[1280] maps-space transition-opacity duration-500 no-print ${warping ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />


      {/* Badge du monde courant (hors Terre) + retour */}
      {worldId !== 'earth' && !cosmosOpen && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1115] flex items-center gap-2 bg-surface-0 rounded-full shadow-md border border-border px-3 py-1 text-xs no-print">
          <span className="font-medium text-text-primary">{worldById(worldId)?.name ?? worldId}</span>
          <button onClick={() => { const e = worldById('earth'); if (e) travelTo(e) }} className="text-primary hover:underline">
            {t('maps_back_earth', { defaultValue: '← Terre' })}
          </button>
        </div>
      )}

      {/* Navigation temps réel (guidage) */}
      {nav.active && nav.state && (
        <MapsNavOverlay state={nav.state} simulating={nav.simulating} onStop={nav.stop} />
      )}

      {/* Profil d'élévation de la trace GPX affichée (bas-centre) */}
      {trackData && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1105] no-print">
          <MapsElevationChart
            name={trackData.name}
            data={trackData.data}
            onClose={() => setTrackData(null)}
            onExport={exportTrackGeoJSON}
          />
        </div>
      )}

      {/* Téléversement GPX en cours */}
      {uploading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100] bg-surface-0 border border-border rounded-full px-3 py-1.5 shadow-md flex items-center gap-2 text-xs text-text-secondary">
          <RefreshCw size={12} className="animate-spin" /> {t('maps_uploading')}
        </div>
      )}

      {/* Menu contextuel */}
      {ctxMenu && (
        <MenuDropdown
          pos={{ top: ctxMenu.y, left: ctxMenu.x, minWidth: 230 }}
          onClose={() => setCtxMenu(null)}
          items={[
            { type: 'label', text: `${ctxMenu.lat.toFixed(5)}, ${ctxMenu.lng.toFixed(5)}` },
            { type: 'action', icon: <Info size={13} />, label: t('maps_whats_here', { defaultValue: "Qu'y a-t-il ici ?" }), onClick: () => whatIsHere(ctxMenu.lat, ctxMenu.lng) },
            { type: 'action', icon: <Star size={13} />, label: t('maps_save_place'), onClick: () => { saveFromContextMenu(ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
            { type: 'separator' },
            {
              type: 'submenu',
              icon: <Navigation size={13} />,
              label: t('maps_tab_route', { defaultValue: 'Itinéraire' }),
              items: [
                { type: 'action', icon: <Navigation size={13} />, label: t('maps_route_from_here', { defaultValue: "Partir d'ici" }),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n[0] = { lat: ctxMenu.lat, lng: ctxMenu.lng }; return n }); setTab('route'); setCtxMenu(null) } },
                { type: 'action', icon: <Flag size={13} />, label: t('maps_route_to_here'),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n[n.length - 1] = { lat: ctxMenu.lat, lng: ctxMenu.lng }; return n }); setTab('route'); setCtxMenu(null) } },
                { type: 'action', icon: <Plus size={13} />, label: t('maps_route_add_stop_here', { defaultValue: 'Ajouter comme étape' }),
                  onClick: () => { setWaypoints(wp => { const n = [...wp]; n.splice(Math.max(1, n.length - 1), 0, { lat: ctxMenu.lat, lng: ctxMenu.lng }); return n }); setTab('route'); setCtxMenu(null) } },
              ],
            },
            // Retiré du menu quand l'administrateur a coupé la recherche de POI.
            ...(poiEnabled ? [{
              type: 'submenu' as const,
              icon: <Search size={13} />,
              label: t('maps_explore_around', { defaultValue: 'Explorer autour' }),
              items: POI_CHIPS.map(c => ({
                type: 'action' as const,
                label: `${c.emoji}  ${t(c.labelKey, { defaultValue: c.fallback })}`,
                onClick: () => { searchCategory(c, { lat: ctxMenu.lat, lng: ctxMenu.lng }); setCtxMenu(null) },
              })),
            }] : []),
            {
              type: 'submenu',
              icon: <Ruler size={13} />,
              label: t('maps_measure_draw', { defaultValue: 'Mesurer / Dessiner' }),
              items: [
                { type: 'action', icon: <Ruler size={13} />, label: t('maps_tool_measure_dist', { defaultValue: 'Mesurer une distance' }),
                  onClick: () => { setTab('sketch'); sketch.setTool('measure-line'); setCtxMenu(null) } },
                { type: 'action', icon: <Shapes size={13} />, label: t('maps_tool_measure_area', { defaultValue: 'Mesurer une surface' }),
                  onClick: () => { setTab('sketch'); sketch.setTool('measure-area'); setCtxMenu(null) } },
                { type: 'action', icon: <MapPin size={13} />, label: t('maps_drop_pin_here', { defaultValue: 'Déposer une épingle ici' }),
                  onClick: () => { setTab('sketch'); sketch.addFeatureAt('pin', ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
                { type: 'action', icon: <TypeIcon size={13} />, label: t('maps_add_text_here', { defaultValue: 'Ajouter du texte ici' }),
                  onClick: () => { setTab('sketch'); sketch.addFeatureAt('text', ctxMenu.lat, ctxMenu.lng, 'Texte'); setCtxMenu(null) } },
              ],
            },
            { type: 'separator' },
            { type: 'action', icon: <Copy size={13} />, label: t('maps_copy_coords', { defaultValue: 'Copier les coordonnées' }), onClick: () => copyCoords(ctxMenu.lat, ctxMenu.lng) },
            // Cross-module copy: JSON envelopes pasteable into chat, documents…
            { type: 'action', icon: <MapPin size={13} />, label: t('maps_copy_place', { defaultValue: 'Copier le lieu' }),
              onClick: () => { copyKubunoData(pointEnvelope(ctxMenu.lat, ctxMenu.lng, ctxMenu.name)); setCtxMenu(null) } },
            // Cross-module labels (core-managed, browsable at /labels).
            { type: 'action', icon: <Star size={13} />, label: t('maps_kubuno_labels', { defaultValue: 'Étiquettes Kubuno…' }),
              onClick: () => { openLabelPicker(pointEnvelope(ctxMenu.lat, ctxMenu.lng, ctxMenu.name)); setCtxMenu(null) } },
            ...(route.results[route.selected] ? [{
              type: 'action' as const, icon: <Route size={13} />, label: t('maps_copy_route', { defaultValue: "Copier l'itinéraire" }),
              onClick: () => {
                const wps = waypoints.filter((w): w is Waypoint => w != null)
                copyKubunoData(routeEnvelope(route.results[route.selected], wps, route.effectiveMode))
                setCtxMenu(null)
              },
            }] : []),
            { type: 'action', icon: <Layers size={13} />, label: t('maps_copy_view', { defaultValue: 'Copier la vue actuelle' }),
              onClick: () => {
                const m = mapRef.current
                if (m) { const c = m.getCenter(); copyKubunoData(viewEnvelope(c.lat, c.lng, m.getZoom())) }
                setCtxMenu(null)
              } },
            { type: 'action', icon: <Compass size={13} />, label: t('maps_center_here', { defaultValue: 'Centrer ici' }), onClick: () => { flyTo(ctxMenu.lat, ctxMenu.lng); setCtxMenu(null) } },
          ]}
        />
      )}

      {/* Modale d'enregistrement */}
      {saveModal && (
        <SavePlaceModal
          lat={saveModal.lat}
          lng={saveModal.lng}
          defaultName={saveModal.name}
          onSave={confirmSave}
          onClose={() => setSaveModal(null)}
        />
      )}
    </div>
  )
}
