import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X, MapPin, Clock, Phone, Globe, Mail, Navigation, Star, Accessibility, BookOpen, Utensils,
  Wifi, Users, Ticket, MessageSquarePlus, Trash2, Bookmark, Compass, Share2, Check, Copy,
} from 'lucide-react'
import { api, useAuthStore } from '@kubuno/sdk'
import { placeDetails, fetchPlacePhoto, fetchPlaceGallery, type SearchResult, type PlacePhoto, type GalleryImage } from './geocoding'
import { copyKubunoData, placeEnvelope } from './kubunoData'
import { MapsImageLightbox } from './MapsImageLightbox'

interface Review { id: string; owner_id: string; rating: number; comment: string | null; created_at: string }

// Étoiles (lecture ou sélection).
function Stars({ n, size = 13, onPick }: { n: number; size?: number; onPick?: (v: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(n) ? 'currentColor' : 'none'}
          className={`${i <= Math.round(n) ? 'text-amber-500' : 'text-text-tertiary'} ${onPick ? 'cursor-pointer' : ''}`}
          onClick={onPick ? () => onPick(i) : undefined} />
      ))}
    </span>
  )
}

// Bouton d'action de l'en-tête (icône au-dessus, libellé en dessous) — façon Google.
function Action({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 min-w-[58px] group">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
        active ? 'bg-primary border-primary text-white' : 'border-border text-primary group-hover:bg-primary-light'}`}>
        {icon}
      </span>
      <span className="text-[10px] text-text-secondary text-center leading-tight">{label}</span>
    </button>
  )
}

// Panneau d'informations détaillées d'un lieu (façon Google Maps), construit à
// partir des tags OpenStreetMap + photo/résumé Wikipédia + avis (backend Kubuno).
export function MapsPlacePanel({
  place, onClose, onRouteTo, onSave, onNearby,
}: {
  place:     SearchResult
  onClose:   () => void
  onRouteTo: (lat: number, lng: number, label: string) => void
  onSave:    (place: SearchResult) => void
  onNearby?: (lat: number, lng: number, label: string) => void
}) {
  const { t } = useTranslation('maps')
  const me = useAuthStore(s => s.user)
  const d   = placeDetails(place)
  const lat = parseFloat(place.lat)
  const lng = parseFloat(place.lon)

  const [tab, setTab] = useState<'info' | 'reviews'>('info')
  const [shared, setShared] = useState(false)
  const [copied, setCopied] = useState(false)

  // Photo + résumé + galerie (Wikipédia/Commons/image).
  const [media, setMedia] = useState<PlacePhoto | null>(null)
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [imgFailed, setImgFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)  // index dans `strip`

  // Avis (backend) — par osm_type/osm_id.
  const osmType = place.osm_type, osmId = place.osm_id
  const [reviews, setReviews] = useState<Review[]>([])
  const [adding, setAdding] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  useEffect(() => {
    let cancelled = false
    setMedia(null); setGallery([]); setImgFailed(false); setTab('info'); setExpanded(false); setLightbox(null)
    fetchPlacePhoto(place).then(m => { if (!cancelled) setMedia(m) }).catch(() => {})
    fetchPlaceGallery(place).then(g => { if (!cancelled) setGallery(g) }).catch(() => {})
    return () => { cancelled = true }
  }, [place.place_id, place.lat, place.lon])  // eslint-disable-line react-hooks/exhaustive-deps

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

  const wheelchairLabel = d.wheelchair === 'yes' ? t('maps_access_yes', { defaultValue: 'Accessible en fauteuil roulant' })
    : d.wheelchair === 'limited' ? t('maps_access_limited', { defaultValue: 'Accessibilité limitée' })
    : d.wheelchair === 'no' ? t('maps_access_no', { defaultValue: 'Non accessible en fauteuil' }) : null

  const share = () => {
    const url = `${location.origin}/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}&q=${encodeURIComponent(d.title)}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setShared(true); setTimeout(() => setShared(false), 1800)
  }

  // Cross-module copy: a JSON envelope pasteable as a rich card in chat, documents…
  const copyPlace = () => {
    copyKubunoData(placeEnvelope(place)).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  const submitReview = async () => {
    if (!osmType || osmId == null) return
    try {
      await api.post('/maps/reviews', {
        osm_type: osmType, osm_id: osmId,
        place_name: place.namedetails?.name || place.display_name.split(',')[0].trim(),
        rating, comment: comment.trim() || null,
      })
      setAdding(false); setComment(''); setRating(5); loadReviews()
    } catch {/* ignore */}
  }
  const removeReview = async (id: string) => {
    try { await api.delete(`/maps/reviews/${id}`); loadReviews() } catch {/* ignore */}
  }

  const Row = ({ icon, children, href }: { icon: React.ReactNode; children: React.ReactNode; href?: string }) => (
    <div className="flex items-start gap-3 px-1 py-2 border-t border-border first:border-t-0">
      <span className="text-text-tertiary mt-0.5 flex-shrink-0">{icon}</span>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all leading-snug">{children}</a>
        : <span className="text-xs text-text-secondary leading-snug break-words">{children}</span>}
    </div>
  )

  const hasReviews = osmType && osmId != null

  return (
    <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col h-full min-h-0">
      {/* Photo (hero) — hauteur adaptative : plus grande sur écran haut, pour éviter
          de trop rogner verticalement les photos en portrait. */}
      {media?.photo && !imgFailed && (
        <div className="relative bg-surface-2 flex-shrink-0" style={{ height: 'clamp(180px, 32vh, 340px)' }}>
          <img src={media.photo} alt={d.title} loading="lazy" onError={() => setImgFailed(true)} className="w-full h-full object-cover" />
          <button onClick={onClose} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"><X size={16} /></button>
          {media.credit && <span className="absolute bottom-1 right-2 text-[10px] text-white/80 bg-black/30 rounded px-1">{media.credit}</span>}
        </div>
      )}

      {/* En-tête */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-semibold text-text-primary leading-tight">{d.title}</h2>
          {(!media?.photo || imgFailed) && (
            <button onClick={onClose} className="text-text-tertiary hover:text-text-primary flex-shrink-0 -mt-0.5"><X size={18} /></button>
          )}
        </div>

        {/* Note + avis (cliquable) */}
        {avg != null && (
          <button onClick={() => setTab('reviews')} className="flex items-center gap-1.5 mt-1 text-xs hover:underline">
            <span className="font-semibold text-amber-600">{avg.toFixed(1)}</span>
            <Stars n={avg} size={12} />
            <span className="text-text-tertiary">({reviews.length})</span>
          </button>
        )}

        {/* Catégorie + commodités */}
        <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary flex-wrap">
          <span>{d.categoryLabel}</span>
          {d.stars && (
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: Math.min(5, parseInt(d.stars) || 0) }).map((_, i) => <Star key={i} size={11} fill="currentColor" />)}
            </span>
          )}
          {d.amenityIcons.length > 0 && <span className="flex items-center gap-1">{d.amenityIcons.map((e, i) => <span key={i}>{e}</span>)}</span>}
        </div>

        {/* Rangée d'actions (façon Google) */}
        <div className="flex items-start gap-1 mt-3">
          <Action icon={<Navigation size={16} />} label={t('maps_directions', { defaultValue: 'Itinéraire' })} onClick={() => onRouteTo(lat, lng, d.title)} />
          <Action icon={<Bookmark size={16} />}   label={t('maps_save', { defaultValue: 'Enregistrer' })}   onClick={() => onSave(place)} />
          {onNearby && <Action icon={<Compass size={16} />} label={t('maps_nearby', { defaultValue: 'À proximité' })} onClick={() => onNearby(lat, lng, d.title)} />}
          <Action icon={shared ? <Check size={16} /> : <Share2 size={16} />} label={shared ? t('maps_copied', { defaultValue: 'Copié !' }) : t('maps_share', { defaultValue: 'Partager' })} onClick={share} active={shared} />
          <Action icon={copied ? <Check size={16} /> : <Copy size={16} />} label={copied ? t('maps_copied', { defaultValue: 'Copié !' }) : t('common_copy', { defaultValue: 'Copier' })} onClick={copyPlace} active={copied} />
        </div>

        {/* Résumé (dépliable : on ne tronque pas définitivement) */}
        {extract && tab === 'info' && (
          <div className="mt-3">
            <p className={`text-xs text-text-secondary leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>{extract}</p>
            {extract.length > 220 && (
              <button onClick={() => setExpanded(e => !e)} className="text-[11px] text-primary hover:underline mt-0.5">
                {expanded ? t('maps_less', { defaultValue: 'Moins' }) : t('maps_more', { defaultValue: 'Plus' })}
              </button>
            )}
          </div>
        )}
        {media === null && <div className="mt-3 h-3 w-2/3 rounded bg-surface-2 animate-pulse" />}
      </div>

      {/* Onglets */}
      {hasReviews && (
        <div className="flex border-b border-border px-3 gap-4">
          {([['info', t('maps_tab_about', { defaultValue: 'Présentation' })], ['reviews', `${t('maps_reviews', { defaultValue: 'Avis' })}${reviews.length ? ` (${reviews.length})` : ''}`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`pb-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Corps */}
      <div className="px-3 pb-3 overflow-y-auto flex-1 min-h-0">
        {tab === 'info' ? (
          <>
            {d.addressLine && <Row icon={<MapPin size={15} />}>{d.addressLine}</Row>}
            {d.openingHours && <Row icon={<Clock size={15} />}>{d.openingHours}</Row>}
            {d.cuisine && <Row icon={<Utensils size={15} />}>{d.cuisine.replace(/_/g, ' ').replace(/;/g, ', ')}</Row>}
            {d.internet && <Row icon={<Wifi size={15} />}>{d.internet}</Row>}
            {d.capacity && <Row icon={<Users size={15} />}>{t('maps_capacity', { defaultValue: 'Capacité' })} : {d.capacity}</Row>}
            {d.fee && d.fee !== 'no' && <Row icon={<Ticket size={15} />}>{d.fee === 'yes' ? t('maps_fee_yes', { defaultValue: 'Payant' }) : d.fee}</Row>}
            {d.phone && <Row icon={<Phone size={15} />} href={`tel:${d.phone}`}>{d.phone}</Row>}
            {d.website && <Row icon={<Globe size={15} />} href={d.website}>{d.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Row>}
            {d.email && <Row icon={<Mail size={15} />} href={`mailto:${d.email}`}>{d.email}</Row>}
            {wheelchairLabel && d.wheelchair !== 'yes' && <Row icon={<Accessibility size={15} />}>{wheelchairLabel}</Row>}
            {d.wikipedia && <Row icon={<BookOpen size={15} />} href={d.wikipedia}>Wikipédia</Row>}
            <Row icon={<MapPin size={15} className="opacity-0" />}><span className="text-text-tertiary">{lat.toFixed(5)}, {lng.toFixed(5)}</span></Row>

            {/* Galerie — clic → visionneuse plein écran */}
            {strip.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pt-2" style={{ scrollbarWidth: 'none' }}>
                {strip.map((g, i) => (
                  <button key={i} onClick={() => setLightbox(i)} className="flex-shrink-0">
                    <img src={g.thumb} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover border border-border hover:opacity-90" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="pt-2">
            {!adding ? (
              <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary-light">
                <MessageSquarePlus size={13} /> {t('maps_review_add', { defaultValue: 'Donner un avis' })}
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-2 mb-2 rounded-lg bg-surface-1">
                <Stars n={rating} size={20} onPick={setRating} />
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
                  placeholder={t('maps_review_comment', { defaultValue: 'Votre avis (optionnel)…' })}
                  className="w-full px-2 py-1 rounded border border-border bg-surface-0 text-xs resize-none focus:outline-none focus:border-primary" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAdding(false)} className="text-[11px] text-text-tertiary hover:text-text-primary px-2">{t('common_cancel', { defaultValue: 'Annuler' })}</button>
                  <button onClick={submitReview} className="text-[11px] bg-primary text-white rounded px-2.5 py-1 font-medium hover:bg-primary-hover">{t('common_save', { defaultValue: 'Publier' })}</button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {reviews.map(r => (
                <div key={r.id} className="group flex items-start gap-2 text-xs border-t border-border pt-2 first:border-t-0">
                  <div className="flex-1 min-w-0">
                    <Stars n={r.rating} size={12} />
                    {r.comment && <p className="text-text-secondary leading-snug mt-0.5">{r.comment}</p>}
                  </div>
                  {me?.id === r.owner_id && (
                    <button onClick={() => removeReview(r.id)} className="text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
              {reviews.length === 0 && !adding && <p className="text-[11px] text-text-tertiary text-center py-2">{t('maps_reviews_empty', { defaultValue: 'Aucun avis pour le moment. Soyez le premier !' })}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Visionneuse plein écran des photos de la galerie */}
      {lightbox !== null && strip.length > 0 && (
        <MapsImageLightbox images={strip} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
