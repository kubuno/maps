import { useTranslation } from 'react-i18next'
import {
  X, MapPin, Clock, Phone, Globe, Mail, Navigation, Star, Accessibility, BookOpen, Utensils,
} from 'lucide-react'
import { placeDetails, type SearchResult } from './geocoding'

// Panneau d'informations détaillées d'un lieu (façon Google Maps), construit à
// partir des tags OpenStreetMap (adresse, catégorie, horaires, téléphone, site
// web, accessibilité, Wikipédia…). Les éléments propriétaires Google (note/avis,
// photos, horaires d'affluence) ne sont pas disponibles dans les données libres.
export function MapsPlacePanel({
  place, onClose, onRouteTo, onSave,
}: {
  place:     SearchResult
  onClose:   () => void
  onRouteTo: (lat: number, lng: number, label: string) => void
  onSave:    (place: SearchResult) => void
}) {
  const { t } = useTranslation('maps')
  const d   = placeDetails(place)
  const lat = parseFloat(place.lat)
  const lng = parseFloat(place.lon)

  const wheelchairLabel = d.wheelchair === 'yes' ? t('maps_access_yes', { defaultValue: 'Accessible en fauteuil roulant' })
    : d.wheelchair === 'limited' ? t('maps_access_limited', { defaultValue: 'Accessibilité limitée' })
    : d.wheelchair === 'no' ? t('maps_access_no', { defaultValue: 'Non accessible en fauteuil' }) : null

  const Row = ({ icon, children, href }: { icon: React.ReactNode; children: React.ReactNode; href?: string }) => (
    <div className="flex items-start gap-3 px-1 py-2 border-t border-border first:border-t-0">
      <span className="text-text-tertiary mt-0.5 flex-shrink-0">{icon}</span>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all leading-snug">{children}</a>
        : <span className="text-xs text-text-secondary leading-snug break-words">{children}</span>}
    </div>
  )

  return (
    <div className="bg-surface-0 rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col max-h-full">
      {/* En-tête */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary leading-tight">{d.title}</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary flex-shrink-0 -mt-0.5">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
          <span>{d.categoryLabel}</span>
          {d.stars && (
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: Math.min(5, parseInt(d.stars) || 0) }).map((_, i) => <Star key={i} size={11} fill="currentColor" />)}
            </span>
          )}
          {d.wheelchair === 'yes' && <Accessibility size={13} className="text-primary" />}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button onClick={() => onRouteTo(lat, lng, d.title)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors">
            <Navigation size={14} /> {t('maps_directions', { defaultValue: 'Itinéraire' })}
          </button>
          <button onClick={() => onSave(place)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-surface-1 transition-colors">
            <Star size={14} /> {t('maps_save', { defaultValue: 'Enregistrer' })}
          </button>
        </div>
      </div>

      {/* Détails */}
      <div className="px-3 pb-3 overflow-y-auto">
        {d.addressLine && <Row icon={<MapPin size={15} />}>{d.addressLine}</Row>}
        {d.openingHours && <Row icon={<Clock size={15} />}>{d.openingHours}</Row>}
        {d.cuisine && <Row icon={<Utensils size={15} />}>{d.cuisine.replace(/_/g, ' ').replace(/;/g, ', ')}</Row>}
        {d.phone && <Row icon={<Phone size={15} />} href={`tel:${d.phone}`}>{d.phone}</Row>}
        {d.website && <Row icon={<Globe size={15} />} href={d.website}>{d.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Row>}
        {d.email && <Row icon={<Mail size={15} />} href={`mailto:${d.email}`}>{d.email}</Row>}
        {wheelchairLabel && d.wheelchair !== 'yes' && <Row icon={<Accessibility size={15} />}>{wheelchairLabel}</Row>}
        {d.wikipedia && <Row icon={<BookOpen size={15} />} href={d.wikipedia}>Wikipédia</Row>}
        <Row icon={<MapPin size={15} className="opacity-0" />}>
          <span className="text-text-tertiary">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
        </Row>
      </div>
    </div>
  )
}
