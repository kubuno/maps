/**
 * Code-behind of `MapsPlacePanel.kbview` (converted from `MapsPlacePanel.tsx`).
 *
 * Place details panel - the whole left rail of the map. Built from the OSM tags of the search result, a free
 * photo/extract (Wikipedia/Commons) and the module's own reviews. The children are rendered through
 * `<ReactHost>`; this class holds the tabs, the photo/gallery/reviews fetching and the collapse state.
 */
import { bind, type EventArgs, type ValueChangedEventArgs } from '@kubuno/views'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@kubuno/sdk'
import type { TabDef } from '@ui'

import { ViewBase } from './MapsPlacePanel.kbview'
import { placeDetails, fetchPlacePhoto, fetchPlaceGallery, type SearchResult, type PlaceInfo, type PlacePhoto, type GalleryImage } from '../services/geocoding'
import { MapsImageLightbox } from '../maps-app/MapsImageLightbox'
import { type PlaceTab } from './MapsPlaceHeader'
import MapsPlaceActions from './MapsPlaceActions'
import { MapsPlaceInfo, MapsPlaceAbout, MapsPlaceTickets } from '../maps-app/MapsPlaceInfo'
import MapsPlaceReviews, { type Review } from './MapsPlaceReviews'
import { useMapsUiStore } from '../model/mapsUiStore'

/** Booking / ticketing URL from the OSM tags, when the place advertises one. */
function bookingUrl(x: Record<string, string> | null): string | null {
  if (!x) return null
  const isUrl = (v?: string) => !!v && /^https?:\/\//.test(v)
  for (const k of ['booking', 'contact:booking', 'website:booking', 'reservation:url', 'tickets:url', 'url:tickets', 'contact:tickets', 'reservation']) {
    if (isUrl(x[k])) return x[k]
  }
  return null
}

export interface MapsPlacePanelProps {
  place:     SearchResult
  onClose:   () => void
  onRouteTo: (lat: number, lng: number, label: string) => void
  onSave:    (place: SearchResult) => void
  onNearby?: (lat: number, lng: number, label: string) => void
  saved?:    boolean
}

export class MapsPlacePanel extends ViewBase {
  @bind accessor tab: PlaceTab = 'overview'
  @bind accessor reviewFormOpen = false
  @bind accessor imgFailed = false
  @bind accessor lightbox: number | null = null
  tr!: MapsPlacePanelStores['t']
  collapsed = false
  private setCollapsed!: (v: boolean) => void
  media: PlacePhoto | null = null
  gallery: GalleryImage[] = []
  reviews: Review[] = []
  private loadReviews!: () => void

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  useHooks() {
    const place = this.props.place
    const collapsed = useMapsUiStore(s => s.panelCollapsed)
    const setCollapsed = useMapsUiStore(s => s.setPanelCollapsed)
    const [media, setMedia] = useState<PlacePhoto | null>(null)
    const [gallery, setGallery] = useState<GalleryImage[]>([])
    const [reviews, setReviews] = useState<Review[]>([])
    const osmType = place.osm_type, osmId = place.osm_id

    useEffect(() => {
      let cancelled = false
      this.tab = 'overview'; this.reviewFormOpen = false; this.imgFailed = false; this.lightbox = null
      setMedia(null); setGallery([])
      fetchPlacePhoto(place).then(m => { if (!cancelled) setMedia(m) }).catch(() => {})
      fetchPlaceGallery(place).then(g => { if (!cancelled) setGallery(g) }).catch(() => {})
      return () => { cancelled = true }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [place.place_id, place.lat, place.lon])

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

    this.publish({ collapsed, setCollapsed, media, gallery, reviews, loadReviews })
    return { collapsed }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
    this.useHooks()
  }

  get expanded() { return !this.collapsed }
  get d(): PlaceInfo { return this.memo('d', [this.props.place], () => placeDetails(this.props.place)) }
  get lat() { return parseFloat(this.props.place.lat) }
  get lng() { return parseFloat(this.props.place.lon) }
  get avg() { return this.reviews.length ? this.reviews.reduce((s, r) => s + r.rating, 0) / this.reviews.length : null }
  get extract() { return this.media?.extract ?? this.d.description }
  get booking() { return bookingUrl(this.props.place.extratags) }
  get placeName() { return this.props.place.namedetails?.name || this.props.place.display_name.split(',')[0].trim() }

  get strip() {
    return this.memo('strip', [this.gallery, this.media], () =>
      this.gallery.filter(g => g.thumb !== this.media?.photo && g.full !== this.media?.photo).slice(0, 8))
  }

  get tabs(): TabDef<PlaceTab>[] {
    return this.memo('tabs', [this.tr, this.reviews.length, this.booking, this.d.website], () => {
      const list: TabDef<PlaceTab>[] = [
        { id: 'overview', label: this.tr('maps_tab_about', { defaultValue: 'Présentation' }) },
        { id: 'reviews', label: this.tr('maps_reviews', { defaultValue: 'Avis' }), badge: this.reviews.length || undefined },
        { id: 'about', label: this.tr('maps_place_tab_details', { defaultValue: 'À propos' }) },
      ]
      if (this.booking || this.d.website) list.push({ id: 'tickets', label: this.tr('maps_place_tab_tickets', { defaultValue: 'Billets' }) })
      return list
    })
  }

  get is_overview() { return this.tab === 'overview' }
  get is_reviews() { return this.tab === 'reviews' }
  get is_about() { return this.tab === 'about' }
  get is_tickets() { return this.tab === 'tickets' }
  get show_lightbox() { return this.lightbox !== null && this.strip.length > 0 }
  get collapse_label() {
    return this.collapsed
      ? this.tr('maps_place_panel_expand', { defaultValue: 'Afficher le panneau' })
      : this.tr('maps_place_panel_collapse', { defaultValue: 'Masquer le panneau' })
  }

  get Actions() { return MapsPlaceActions }
  get Info() { return MapsPlaceInfo }
  get Reviews() { return MapsPlaceReviews }
  get About() { return MapsPlaceAbout }
  get Tickets() { return MapsPlaceTickets }
  get Lightbox() { return MapsImageLightbox }

  private setTab(id: PlaceTab) {
    this.tab = id
    if (id !== 'reviews') this.reviewFormOpen = false
  }

  // --- MapsPlaceHeader (native element) ---
  get review_count() { return this.reviews.length }
  header_img_error(_s: unknown, _e: EventArgs) { this.imgFailed = true }
  place_close(_s: unknown, _e: EventArgs) { this.props.onClose() }
  header_reviews_click(_s: unknown, _e: EventArgs) { this.tab = 'reviews' }
  header_add_review(_s: unknown, _e: EventArgs) { this.reviewFormOpen = true; this.tab = 'reviews' }
  header_tab(_s: unknown, e: ValueChangedEventArgs) { this.setTab(e.value as PlaceTab) }

  get actions_props() {
    return this.memo('actions_props', [this.props.place, this.d, this.lat, this.lng, this.props.saved], () => ({
      place: this.props.place, lat: this.lat, lng: this.lng, title: this.d.title, saved: !!this.props.saved,
      onRouteTo: this.memo('onRouteTo:bound', [this.lat, this.lng, this.d.title], () => () => this.props.onRouteTo(this.lat, this.lng, this.d.title)),
      onSave: this.memo('onSave:bound', [], () => () => this.props.onSave(this.props.place)),
      onNearby: this.props.onNearby ? this.memo('onNearby:bound', [this.lat, this.lng, this.d.title], () => () => this.props.onNearby?.(this.lat, this.lng, this.d.title)) : undefined,
    }))
  }

  get info_props() {
    return this.memo('info_props', [this.d, this.extract, this.media, this.lat, this.lng, this.strip], () => ({
      d: this.d, extract: this.extract, loading: this.media === null, lat: this.lat, lng: this.lng,
      strip: this.strip,
      onOpenImage: this.memo('onOpenImage:bound', [], () => (i: number) => { this.lightbox = i }),
    }))
  }

  get reviews_props() {
    return this.memo('reviews_props', [this.reviews, this.props.place, this.placeName, this.reviewFormOpen, this.loadReviews], () => ({
      reviews: this.reviews, osmType: this.props.place.osm_type, osmId: this.props.place.osm_id,
      placeName: this.placeName, onChanged: this.loadReviews, autoOpen: this.reviewFormOpen,
    }))
  }

  get about_props() { return this.memo('about_props', [this.d], () => ({ d: this.d })) }
  get tickets_props() { return this.memo('tickets_props', [this.d, this.booking], () => ({ d: this.d, booking: this.booking })) }

  get lightbox_props() {
    return this.memo('lightbox_props', [this.strip, this.lightbox], () => ({
      images: this.strip, index: this.lightbox ?? 0,
      onIndex: this.memo('onIndex:bound', [], () => (i: number) => { this.lightbox = i }),
      onClose: this.memo('onCloseLb:bound', [], () => () => { this.lightbox = null }),
    }))
  }

  toggle_collapse() {
    this.setCollapsed(!this.collapsed)
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPlacePanelStores = ReturnType<MapsPlacePanel['useStores']>

export default MapsPlacePanel.component()
