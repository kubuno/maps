// React glue for the sketch engine: owns the drawn features + active tool,
// wires MapLibre click/move/dblclick interactions (via refs to avoid stale
// closures / handler churn), and persists sketches to the backend.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { api } from '@kubuno/sdk'
import {
  type SketchFeature, type SketchKind, SKETCH_COLORS,
  haversine, pathDistance, polygonArea, fmtLen, fmtArea,
  toFeatureCollection, fromFeatureCollection, renderSketch, renderDraft,
} from './mapSketch'

export type Tool = 'none' | SketchKind
const DRAW_TOOLS: Tool[] = ['line', 'polygon', 'circle', 'measure-line', 'measure-area']
const MULTI_TOOLS: Tool[] = ['line', 'polygon', 'measure-line', 'measure-area']

export interface SketchSummary {
  id: string; name: string; feature_count: number
  is_public: boolean; share_token: string | null; updated_at: string
}

let idSeq = 0
const nextId = () => `s${Date.now().toString(36)}-${idSeq++}`

export function useSketch(mapRef: RefObject<maplibregl.Map | null>, mapReady: boolean) {
  const [features, setFeatures] = useState<SketchFeature[]>([])
  const [tool, setTool]   = useState<Tool>('none')
  const [color, setColor] = useState<string>(SKETCH_COLORS[0])
  const [draftCount, setDraftCount] = useState(0)

  const [sketches, setSketches] = useState<SketchSummary[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [name, setName] = useState('Croquis')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Refs read by the (once-bound) map handlers — avoid rebinding on each click.
  const toolRef     = useRef(tool);     toolRef.current = tool
  const colorRef    = useRef(color);    colorRef.current = color
  const featuresRef = useRef(features); featuresRef.current = features
  const draftRef    = useRef<[number, number][]>([])
  const cursorRef   = useRef<[number, number] | null>(null)

  const renderDraftNow = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const t = toolRef.current
    const kind = DRAW_TOOLS.includes(t) ? (t as SketchKind) : null
    renderDraft(map, kind, draftRef.current, cursorRef.current, colorRef.current)
  }, [mapRef])

  const resetDraft = useCallback(() => {
    draftRef.current = []
    cursorRef.current = null
    setDraftCount(0)
    renderDraftNow()
  }, [renderDraftNow])

  const addFeature = useCallback((f: Omit<SketchFeature, 'id'>) => {
    setFeatures(prev => [...prev, { ...f, id: nextId() }])
  }, [])

  // Dépose un élément (épingle/texte) à un point précis — utilisé par le menu
  // contextuel de la carte.
  const addFeatureAt = useCallback((kind: SketchKind, lat: number, lng: number, label?: string) => {
    addFeature({ kind, coords: [[lng, lat]], color: colorRef.current, label })
  }, [addFeature])

  // Commit the in-progress line/polygon/measure draft into a permanent feature.
  const finishDraft = useCallback(() => {
    const pts = draftRef.current
    const t = toolRef.current
    const c = colorRef.current
    if (t === 'line' && pts.length >= 2) addFeature({ kind: 'line', coords: pts, color: c })
    else if (t === 'measure-line' && pts.length >= 2) addFeature({ kind: 'measure-line', coords: pts, color: c, label: fmtLen(pathDistance(pts)) })
    else if (t === 'polygon' && pts.length >= 3) addFeature({ kind: 'polygon', coords: [...pts], color: c })
    else if (t === 'measure-area' && pts.length >= 3) addFeature({ kind: 'measure-area', coords: [...pts], color: c, label: fmtArea(polygonArea(pts)) })
    resetDraft()
  }, [addFeature, resetDraft])

  // ── Map interactions (bound once map is ready; read state via refs) ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const t = toolRef.current
      if (t === 'none') return
      const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      const c = colorRef.current
      if (t === 'pin' || t === 'text') {
        addFeature({ kind: t, coords: [ll], color: c, label: t === 'text' ? 'Texte' : undefined })
        return
      }
      if (t === 'circle') {
        if (draftRef.current.length === 0) { draftRef.current = [ll]; setDraftCount(1) }
        else {
          const center = draftRef.current[0]
          const r = haversine(center, ll)
          addFeature({ kind: 'circle', coords: [center], color: c, radius: r, label: fmtLen(r) })
          resetDraft()
        }
        renderDraftNow()
        return
      }
      // Multi-vertex tools.
      draftRef.current = [...draftRef.current, ll]
      setDraftCount(draftRef.current.length)
      renderDraftNow()
    }

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!DRAW_TOOLS.includes(toolRef.current)) return
      if (draftRef.current.length === 0) return
      cursorRef.current = [e.lngLat.lng, e.lngLat.lat]
      renderDraftNow()
    }

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (!MULTI_TOOLS.includes(toolRef.current)) return
      e.preventDefault()
      finishDraft()
    }

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') resetDraft()
      else if (ev.key === 'Enter') finishDraft()
    }

    map.on('click', onClick)
    map.on('mousemove', onMove)
    map.on('dblclick', onDblClick)
    window.addEventListener('keydown', onKey)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      map.off('dblclick', onDblClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [mapRef, mapReady, addFeature, resetDraft, renderDraftNow, finishDraft])

  // Disable double-click-zoom while a multi-vertex tool is active (dblclick = finish).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (MULTI_TOOLS.includes(tool)) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    // Changer d'outil annule un tracé en cours.
    resetDraft()
  }, [tool, mapRef, resetDraft])

  // Render committed features whenever they change.
  useEffect(() => {
    const map = mapRef.current
    if (map && mapReady) renderSketch(map, features)
  }, [features, mapReady, mapRef])

  // Re-render after a base-style reload (layers are dropped by setStyle).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onStyle = () => { renderSketch(map, featuresRef.current); renderDraftNow() }
    map.on('styledata', onStyle)
    return () => { map.off('styledata', onStyle) }
  }, [mapRef, mapReady, renderDraftNow])

  // ── Feature edition (from the panel list) ────────────────────────────────────
  const updateFeature = useCallback((id: string, patch: Partial<SketchFeature>) => {
    setFeatures(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }, [])
  const removeFeature = useCallback((id: string) => {
    setFeatures(prev => prev.filter(f => f.id !== id))
  }, [])
  const undo = useCallback(() => setFeatures(prev => prev.slice(0, -1)), [])
  const clearAll = useCallback(() => { setFeatures([]); resetDraft() }, [resetDraft])

  // ── Persistence ──────────────────────────────────────────────────────────────
  const loadSketches = useCallback(async () => {
    try {
      const { data } = await api.get<{ sketches: SketchSummary[] }>('/maps/sketches')
      setSketches(data.sketches ?? [])
    } catch { /* ignore */ }
  }, [])

  const newSketch = useCallback(() => {
    setFeatures([]); setCurrentId(null); setName('Croquis'); setShareUrl(null); resetDraft()
  }, [resetDraft])

  const saveSketch = useCallback(async () => {
    setBusy(true)
    try {
      const body = { name, data: toFeatureCollection(featuresRef.current) }
      if (currentId) {
        await api.put(`/maps/sketches/${currentId}`, body)
      } else {
        const { data } = await api.post<{ id: string }>('/maps/sketches', body)
        setCurrentId(data.id)
      }
      await loadSketches()
    } catch { /* ignore */ } finally { setBusy(false) }
  }, [name, currentId, loadSketches])

  const openSketch = useCallback(async (id: string) => {
    setBusy(true)
    try {
      const { data } = await api.get<{ id: string; name: string; data: unknown; share_token: string | null; is_public: boolean }>(`/maps/sketches/${id}`)
      setFeatures(fromFeatureCollection(data.data))
      setCurrentId(data.id)
      setName(data.name)
      setShareUrl(data.is_public && data.share_token
        ? `${location.origin}/maps/s/${data.share_token}` : null)
      setTool('none')
    } catch { /* ignore */ } finally { setBusy(false) }
  }, [])

  const deleteSketch = useCallback(async (id: string) => {
    try {
      await api.delete(`/maps/sketches/${id}`)
      if (id === currentId) newSketch()
      await loadSketches()
    } catch { /* ignore */ }
  }, [currentId, newSketch, loadSketches])

  // Active le partage public et renvoie/copie le lien (GeoJSON). Sauve d'abord si besoin.
  const shareSketch = useCallback(async () => {
    setBusy(true)
    try {
      let id = currentId
      if (!id) {
        const { data } = await api.post<{ id: string }>('/maps/sketches', { name, data: toFeatureCollection(featuresRef.current) })
        id = data.id; setCurrentId(id)
      } else {
        await api.put(`/maps/sketches/${id}`, { name, data: toFeatureCollection(featuresRef.current) })
      }
      const { data } = await api.post<{ share_token: string | null; is_public: boolean }>(`/maps/sketches/${id}/share`, { public: true })
      const url = data.share_token ? `${location.origin}/maps/s/${data.share_token}` : null
      setShareUrl(url)
      if (url && navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
      await loadSketches()
      return url
    } catch { return null } finally { setBusy(false) }
  }, [currentId, name, loadSketches])

  return {
    // drawing
    features, tool, setTool, color, setColor, draftCount,
    finishDraft, undo, clearAll, updateFeature, removeFeature, addFeatureAt,
    // persistence
    sketches, currentId, name, setName, shareUrl, busy,
    loadSketches, newSketch, saveSketch, openSketch, deleteSketch, shareSketch,
  }
}
