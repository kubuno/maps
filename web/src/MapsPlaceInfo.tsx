import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, ChevronDown, MapPin, Clock, Phone, Globe, Mail, BookOpen, Utensils, Wifi, Users,
  Ticket, Accessibility, Building2, Tag, ExternalLink, Leaf, ShoppingBag, Truck, TreePine, Star,
} from 'lucide-react'
import type { PlaceInfo, GalleryImage } from './geocoding'
import { hoverBg } from './MapsPlaceActions'

/** Light grey card with the Wikipedia extract, clamped to 3 lines until clicked. */
export function DescriptionCard({ text }: { text: string }) {
  const { t } = useTranslation('maps')
  const [open, setOpen] = useState(false)
  return (
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
      className="w-full text-left flex items-start gap-3 px-4 py-4 outline-none"
      style={{ background: '#f1f3f4' }} {...hoverBg('#e8eaed')}
      title={open ? t('maps_less', { defaultValue: 'Moins' }) : t('maps_more', { defaultValue: 'Plus' })}>
      <p className={`flex-1 min-w-0 text-sm leading-5 ${open ? '' : 'line-clamp-3'}`} style={{ color: '#3c4043' }}>{text}</p>
      {open ? <ChevronDown size={20} className="text-text-secondary flex-shrink-0 mt-0.5" /> : <ChevronRight size={20} className="text-text-secondary flex-shrink-0 mt-0.5" />}
    </button>
  )
}

/** One information row: 20 px grey icon on the left, 15 px text (or link). */
function Row({ icon, children, href, muted }: { icon: ReactNode; children: ReactNode; href?: string; muted?: boolean }) {
  const inner = (
    <>
      <span className="text-text-secondary flex-shrink-0 mt-0.5 w-5 flex justify-center">{icon}</span>
      <span className={`flex-1 min-w-0 text-sm leading-5 break-words ${href ? 'text-primary' : muted ? 'text-text-tertiary' : ''}`}
        style={href || muted ? undefined : { color: '#3c4043' }}>{children}</span>
      {href && <ExternalLink size={16} className="text-text-tertiary flex-shrink-0 mt-1" />}
    </>
  )
  const cls = 'flex items-start gap-4 px-4 py-2.5 w-full text-left'
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={`${cls} no-underline`} {...hoverBg('#f1f3f4')}>{inner}</a>
    : <div className={cls}>{inner}</div>
}

/** « Présentation » tab body: description card, info rows, photo strip. */
export function MapsPlaceInfo({
  d, extract, loading, lat, lng, strip, onOpenImage,
}: {
  d: PlaceInfo; extract: string | null; loading: boolean; lat: number; lng: number
  strip: GalleryImage[]; onOpenImage: (i: number) => void
}) {
  const { t } = useTranslation('maps')
  const wheelchairLabel = d.wheelchair === 'limited' ? t('maps_access_limited', { defaultValue: 'Accessibilité limitée' })
    : d.wheelchair === 'no' ? t('maps_access_no', { defaultValue: 'Non accessible en fauteuil' }) : null

  return (
    <div className="pb-4">
      {extract ? <DescriptionCard text={extract} /> : loading && <div className="mx-4 my-3 h-16 rounded-lg bg-surface-2 animate-pulse" />}

      <div className="pt-2">
        {d.addressLine && <Row icon={<MapPin size={20} />}>{d.addressLine}</Row>}
        {d.openingHours && <Row icon={<Clock size={20} />}>{d.openingHours}</Row>}
        {d.cuisine && <Row icon={<Utensils size={20} />}>{d.cuisine.replace(/_/g, ' ').replace(/;/g, ', ')}</Row>}
        {d.phone && <Row icon={<Phone size={20} />} href={`tel:${d.phone}`}>{d.phone}</Row>}
        {d.website && <Row icon={<Globe size={20} />} href={d.website}>{d.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Row>}
        {d.email && <Row icon={<Mail size={20} />} href={`mailto:${d.email}`}>{d.email}</Row>}
        {wheelchairLabel && <Row icon={<Accessibility size={20} />}>{wheelchairLabel}</Row>}
        {d.wikipedia && <Row icon={<BookOpen size={20} />} href={d.wikipedia}>Wikipédia</Row>}
        <Row icon={<MapPin size={20} className="opacity-0" />} muted>{lat.toFixed(5)}, {lng.toFixed(5)}</Row>
      </div>

      {/* Photo strip — click opens the full-screen viewer. */}
      {strip.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-2" style={{ scrollbarWidth: 'none' }}>
          {strip.map((g, i) => (
            <button key={i} type="button" onClick={() => onOpenImage(i)} className="flex-shrink-0 rounded-lg overflow-hidden">
              <img src={g.thumb} alt="" loading="lazy" className="w-20 h-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** « À propos » tab body: amenities and facts from the OSM tags. */
export function MapsPlaceAbout({ d }: { d: PlaceInfo }) {
  const { t } = useTranslation('maps')
  const rows: { icon: ReactNode; text: string }[] = []
  if (d.wheelchair === 'yes') rows.push({ icon: <Accessibility size={20} />, text: t('maps_access_yes', { defaultValue: 'Accessible en fauteuil roulant' }) })
  if (d.wheelchair === 'limited') rows.push({ icon: <Accessibility size={20} />, text: t('maps_access_limited', { defaultValue: 'Accessibilité limitée' }) })
  if (d.wheelchair === 'no') rows.push({ icon: <Accessibility size={20} />, text: t('maps_access_no', { defaultValue: 'Non accessible en fauteuil' }) })
  if (d.internet) rows.push({ icon: <Wifi size={20} />, text: d.internet })
  if (d.outdoor) rows.push({ icon: <TreePine size={20} />, text: t('maps_place_outdoor', { defaultValue: 'Terrasse' }) })
  if (d.takeaway) rows.push({ icon: <ShoppingBag size={20} />, text: t('maps_place_takeaway', { defaultValue: 'À emporter' }) })
  if (d.delivery) rows.push({ icon: <Truck size={20} />, text: t('maps_place_delivery', { defaultValue: 'Livraison' }) })
  if (d.vegan) rows.push({ icon: <Leaf size={20} />, text: t('maps_place_vegan', { defaultValue: 'Options véganes' }) })
  else if (d.vegetarian) rows.push({ icon: <Leaf size={20} />, text: t('maps_place_vegetarian', { defaultValue: 'Options végétariennes' }) })
  if (d.capacity) rows.push({ icon: <Users size={20} />, text: `${t('maps_capacity', { defaultValue: 'Capacité' })} : ${d.capacity}` })
  if (d.fee && d.fee !== 'no') rows.push({ icon: <Ticket size={20} />, text: d.fee === 'yes' ? t('maps_fee_yes', { defaultValue: 'Payant' }) : d.fee })
  if (d.fee === 'no') rows.push({ icon: <Ticket size={20} />, text: t('maps_place_free', { defaultValue: 'Entrée gratuite' }) })
  if (d.stars) rows.push({ icon: <Star size={20} />, text: `${d.stars} ${t('maps_place_stars', { defaultValue: 'étoiles' })}` })
  if (d.operator) rows.push({ icon: <Building2 size={20} />, text: `${t('maps_place_operator', { defaultValue: 'Exploitant' })} : ${d.operator}` })
  if (d.brand) rows.push({ icon: <Tag size={20} />, text: `${t('maps_place_brand', { defaultValue: 'Enseigne' })} : ${d.brand}` })

  return (
    <div className="py-2 pb-4">
      {rows.map((r, i) => <Row key={i} icon={r.icon}>{r.text}</Row>)}
      {rows.length === 0 && (
        <p className="px-4 py-6 text-sm text-text-tertiary text-center">{t('maps_place_about_empty', { defaultValue: 'Aucune information complémentaire pour ce lieu.' })}</p>
      )}
    </div>
  )
}

/** « Billets » tab body: booking / official website links. */
export function MapsPlaceTickets({ d, booking }: { d: PlaceInfo; booking: string | null }) {
  const { t } = useTranslation('maps')
  const pretty = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <div className="py-2 pb-4">
      {booking && <Row icon={<Ticket size={20} />} href={booking}>{t('maps_place_book_online', { defaultValue: 'Réserver en ligne' })} — {pretty(booking)}</Row>}
      {d.website && d.website !== booking && <Row icon={<Globe size={20} />} href={d.website}>{t('maps_place_official_site', { defaultValue: 'Site officiel' })} — {pretty(d.website)}</Row>}
      <p className="px-4 pt-3 text-sm text-text-tertiary">{t('maps_place_tickets_hint', { defaultValue: "Les billets s'achètent sur le site de l'établissement." })}</p>
    </div>
  )
}
