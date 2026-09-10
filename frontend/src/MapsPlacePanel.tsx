import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@kubuno/sdk'
import type { TabDef } from '@ui'
import { placeDetails, fetchPlacePhoto, fetchPlaceGallery, type SearchResult, type PlacePhoto, type GalleryImage } from './geocoding'
import { MapsImageLightbox } from './MapsImageLightbox'
import { MapsPlaceHeader, type PlaceTab } from './MapsPlaceHeader'
import { MapsPlaceActions } from './MapsPlaceActions'
import { MapsPlaceInfo, MapsPlaceAbout, MapsPlaceTickets } from './MapsPlaceInfo'
import { MapsPlaceReviews, type Review } from './MapsPlaceReviews'
import { useMapsUiStore } from './mapsUiStore'

/** Booking / ticketing URL from the OSM tags, when the place advertises one. */
function bookingUrl(x: Record<string, string> | null): string | null {
  if (!x) return null
  const isUrl = (v?: string) => !!v && /^https?:\/\//.test(v)
  for (const k of ['booking', 'contact:booking', 'website:booking', 'reservation:url', 'tickets:url', 'url:tickets', 'contact:tickets', 'reservation']) {
    if (isUrl(x[k])) return x[k]
  }
  return null
}

/**
 * Place details panel — the whole left rail of the map: hero photo (the search
 * pill floats over its top), title + rating + category, tabs, round actions,
 * description card, information rows, gallery and reviews. Built from the OSM
 * tags of the search result, a free photo/extract (Wikipedia/Commons) and the
 * module's own reviews. A handle on the right edge slides the rail off-screen.
 */
export function MapsPlacePanel({
  place, onClose, onRouteTo, onSave, onNearby, saved = false,
}: {
  place:     SearchResult
  onClose:   () => void
  onRouteTo: (lat: number, lng: number, label: string) => void
  onSave:    (place: SearchResult) => void
  onNearby?: (lat: number, lng: number, label: string) => void
  /** The place is already in the user's saved places (« Enregistré » state). */
  saved?:    boolean
}) {
  const { t } = useTranslation('maps')
  const d   = placeDetails(place)
  const lat = parseFloat(place.lat)
  const lng = parseFloat(place.lon)
  const collapsed = useMapsUiStore(s => s.panelCollapsed)
  const setCollapsed = useMapsUiStore(s => s.setPanelCollapsed)

  const [tab, setTab] = useState<PlaceTab>('overview')
  const [reviewFormOpen, setReviewFormOpen] = useState(false)

  // Photo + extract + gallery (Wikipedia / Commons / image tag).
  const [media, setMedia] = useState<PlacePhoto | null>(null)
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [imgFailed, setImgFailed] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)  // index into `strip`

  // Reviews (module backend) — keyed by osm_type/osm_id.
  const osmType = place.osm_type, osmId = place.osm_id
  const [reviews, setReviews] = useState<Review[]>([])

  useEffect(() => {
    let cancelled = false
    setMedia(null); setGallery([]); setImgFailed(false); setTab('overview'); setLightbox(null); setReviewFormOpen(false)
    fetchPlacePhoto(place).then(m => { if (!cancelled) setMedia(m) }).catch(() => {})
    fetchPlaceGallery(place).then(g => { if (!cancelled) setGallery(g) }).catch(() => {})
    return () => { cancelled = true }
  }, [place.place_id, place.lat, place.lon])  // eslint-disable-line react-hooks/exhaustive-deps

  // The rail comes back on screen whenever the panel goes away.
  useEffect(() => () => setCollapsed(false), [setCollapsed])

  const loadReviews = useCallback(async () => {
    if (!osmType || osmId == null) { setReviews([]); return }
    try {
      const { data } = await api.get<{ reviews: Review[] }>(`/maps/reviews/${osmType}/${osmId}`)
      setReviews(data.reviews ?? [])
    } catch {/* ignore */}
  }, [osmType, osmId])
  useEffect(() => { loadReviews() }, [loadReviews])

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null
  const extract = media?.extract ?? d.description
  const strip = useMemo(() => gallery.filter(g => g.thumb !== media?.photo && g.full !== media?.photo).slice(0, 8), [gallery, media])
  const booking = bookingUrl(place.extratags)

  const tabs = useMemo<TabDef<PlaceTab>[]>(() => {
    const list: TabDef<PlaceTab>[] = [
      { id: 'overview', label: t('maps_tab_about', { defaultValue: 'Présentation' }) },
      { id: 'reviews',  label: t('maps_reviews', { defaultValue: 'Avis' }), badge: reviews.length || undefined },
      { id: 'about',    label: t('maps_place_tab_details', { defaultValue: 'À propos' }) },
    ]
    if (booking || d.website) list.push({ id: 'tickets', label: t('maps_place_tab_tickets', { defaultValue: 'Billets' }) })
    return list
  }, [t, reviews.length, booking, d.website])

  const openReviewForm = () => { setReviewFormOpen(true); setTab('reviews') }
  const placeName = place.namedetails?.name || place.display_name.split(',')[0].trim()

  return (
    // Not positioned on purpose: the collapse handle anchors to the rail
    // wrapper (MapsPage), which is where the slide transform is applied.
    <div className="h-full min-h-0 flex flex-col bg-surface-0">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <MapsPlaceHeader d={d} media={media} imgFailed={imgFailed} onImgError={() => setImgFailed(true)} onClose={onClose}
          reviewCount={reviews.length} reviewAvg={avg} onReviewsClick={() => setTab('reviews')} onAddReview={openReviewForm}
          tab={tab} tabs={tabs} onTab={id => { setTab(id); if (id !== 'reviews') setReviewFormOpen(false) }} />

        <MapsPlaceActions place={place} lat={lat} lng={lng} title={d.title} saved={saved}
          onRouteTo={() => onRouteTo(lat, lng, d.title)} onSave={() => onSave(place)}
          onNearby={onNearby ? () => onNearby(lat, lng, d.title) : undefined} />

        {tab === 'overview' && <MapsPlaceInfo d={d} extract={extract} loading={media === null} lat={lat} lng={lng} strip={strip} onOpenImage={setLightbox} />}
        {tab === 'reviews'  && <MapsPlaceReviews reviews={reviews} osmType={osmType} osmId={osmId} placeName={placeName} onChanged={loadReviews} autoOpen={reviewFormOpen} />}
        {tab === 'about'    && <MapsPlaceAbout d={d} />}
        {tab === 'tickets'  && <MapsPlaceTickets d={d} booking={booking} />}
      </div>

      {/* Collapse handle — hangs outside the rail's right edge, vertically centred. */}
      <button type="button" onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? t('maps_place_panel_expand', { defaultValue: 'Afficher le panneau' }) : t('maps_place_panel_collapse', { defaultValue: 'Masquer le panneau' })}
        aria-expanded={!collapsed}
        className="absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-12 bg-surface-0 rounded-r-lg shadow-md text-text-secondary flex items-center justify-center"
        style={{ boxShadow: '2px 0 6px rgba(0,0,0,.18)' }}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Full-screen viewer for the gallery photos */}
      {lightbox !== null && strip.length > 0 && (
        <MapsImageLightbox images={strip} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
