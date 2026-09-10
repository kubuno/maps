import { useTranslation } from 'react-i18next'
import { X, Star, Accessibility, Info } from 'lucide-react'
import { Tabs, type TabDef } from '@ui'
import type { PlaceInfo, PlacePhoto } from './geocoding'
import { Stars } from './MapsPlaceReviews'

export type PlaceTab = 'overview' | 'reviews' | 'about' | 'tickets'

/** Height of the hero photo, and the transparent band at its top reserved for the floating search pill. */
export const HERO_HEIGHT = 250
export const PILL_BAND   = 64

/**
 * Top of the place panel: hero photo (the search pill of MapsPage floats over
 * its top band), title, rating line computed from the module's own reviews,
 * category line and the tab strip.
 */
export function MapsPlaceHeader({
  d, media, imgFailed, onImgError, onClose,
  reviewCount, reviewAvg, onReviewsClick, onAddReview,
  tab, tabs, onTab,
}: {
  d:           PlaceInfo
  media:       PlacePhoto | null
  imgFailed:   boolean
  onImgError:  () => void
  onClose:     () => void
  reviewCount: number
  reviewAvg:   number | null
  onReviewsClick: () => void
  onAddReview:    () => void
  tab:   PlaceTab
  tabs:  TabDef<PlaceTab>[]
  onTab: (t: PlaceTab) => void
}) {
  const { t } = useTranslation('maps')
  const hasPhoto = !!media?.photo && !imgFailed
  const loading  = media === null

  const closeBtn = (
    <button type="button" onClick={onClose} title={t('common_close', { defaultValue: 'Fermer' })}
      className="absolute right-3 w-9 h-9 rounded-full bg-white text-text-secondary shadow-md flex items-center justify-center"
      style={{ top: PILL_BAND + 8 }}>
      <X size={18} />
    </button>
  )

  return (
    <div>
      {/* Hero — always occupies the pill band; grows to the full photo height when there is one. */}
      <div className="relative bg-surface-2 overflow-hidden" style={{ height: hasPhoto ? HERO_HEIGHT : (loading ? HERO_HEIGHT : PILL_BAND + 52) }}>
        {hasPhoto && (
          <img src={media!.photo!} alt={d.title} onError={onImgError} className="w-full h-full object-cover" />
        )}
        {loading && <div className="absolute inset-0 animate-pulse bg-surface-3" />}
        {hasPhoto && media?.credit && (
          <span className="absolute bottom-1.5 right-2 text-[10px] text-white/90 bg-black/35 rounded px-1.5 py-0.5">{media.credit}</span>
        )}
        {closeBtn}
      </div>

      {/* Title block */}
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-[22px] font-normal leading-7 break-words" style={{ color: '#202124' }}>{d.title}</h2>

        {/* Rating line, from the module's own reviews. */}
        <div className="flex items-center gap-1.5 mt-1 text-sm">
          {reviewAvg != null ? (
            <>
              <span style={{ color: '#202124' }}>{reviewAvg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              <Stars n={reviewAvg} size={14} />
              <button type="button" onClick={onReviewsClick} className="text-text-secondary underline-offset-2"
                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={e => { e.currentTarget.style.textDecoration = '' }}>
                ({reviewCount.toLocaleString('fr-FR')})
              </button>
              <Info size={14} className="text-text-tertiary" aria-label={t('maps_place_rating_hint', { defaultValue: 'Note moyenne des avis laissés sur Kubuno' })} />
            </>
          ) : (
            <>
              <span className="text-text-secondary">{t('maps_place_no_reviews', { defaultValue: 'Aucun avis' })}</span>
              <span className="text-text-tertiary">·</span>
              <button type="button" onClick={onAddReview} className="text-primary"
                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={e => { e.currentTarget.style.textDecoration = '' }}>
                {t('maps_review_add', { defaultValue: 'Donner un avis' })}
              </button>
            </>
          )}
        </div>

        {/* Category line: « Site historique · ♿ » */}
        <div className="flex items-center gap-1.5 mt-0.5 text-sm text-text-secondary flex-wrap">
          <span>{d.categoryLabel}</span>
          {d.stars && (
            <span className="flex items-center gap-0.5" style={{ color: '#fbbc04' }}>
              {Array.from({ length: Math.min(5, parseInt(d.stars) || 0) }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
            </span>
          )}
          {d.wheelchair === 'yes' && (
            <>
              <span className="text-text-tertiary">·</span>
              <Accessibility size={16} className="text-text-secondary" aria-label={t('maps_access_yes', { defaultValue: 'Accessible en fauteuil roulant' })} />
            </>
          )}
        </div>
      </div>

      {/* Tabs (core primitive, stretched so the strip spans the panel width). */}
      <Tabs<PlaceTab> tabs={tabs} value={tab} onChange={onTab} variant="stretched" size="sm" t={t} className="mt-1" />
    </div>
  )
}
