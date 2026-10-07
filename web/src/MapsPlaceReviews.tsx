import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, MessageSquarePlus, Trash2 } from 'lucide-react'
import { api, useAuthStore } from '@kubuno/sdk'
import { Button, Textarea } from '@ui'

// Reviews of a place, stored by the module backend (`/maps/reviews*`), keyed by
// OSM type + id. Shared by the header (average + count) and the « Avis » tab.
export interface Review { id: string; owner_id: string; rating: number; comment: string | null; created_at: string }

/** Star row (read-only, or clickable when `onPick` is given). Amber like the header rating. */
export function Stars({ n, size = 13, onPick }: { n: number; size?: number; onPick?: (v: number) => void }) {
  return (
    <span className="inline-flex" aria-hidden={!onPick}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(n) ? 'currentColor' : 'none'}
          strokeWidth={1.75}
          style={{ color: i <= Math.round(n) ? '#fbbc04' : '#dadce0' }}
          className={onPick ? 'cursor-pointer' : ''}
          onClick={onPick ? () => onPick(i) : undefined} />
      ))}
    </span>
  )
}

/** « Avis » tab: add form + list (delete own reviews). */
export function MapsPlaceReviews({
  reviews, osmType, osmId, placeName, onChanged, autoOpen,
}: {
  reviews:   Review[]
  osmType:   string | null
  osmId:     number | null
  placeName: string
  onChanged: () => void
  /** Open the form right away (« Donner un avis » link in the header). */
  autoOpen?: boolean
}) {
  const { t } = useTranslation('maps')
  const me = useAuthStore(s => s.user)
  const [adding, setAdding] = useState(!!autoOpen)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const canReview = !!osmType && osmId != null

  const submit = async () => {
    if (!canReview) return
    try {
      await api.post('/maps/reviews', {
        osm_type: osmType, osm_id: osmId, place_name: placeName,
        rating, comment: comment.trim() || null,
      })
      setAdding(false); setComment(''); setRating(5); onChanged()
    } catch {/* ignore */}
  }
  const remove = async (id: string) => {
    try { await api.delete(`/maps/reviews/${id}`); onChanged() } catch {/* ignore */}
  }

  if (!canReview) {
    return <p className="px-4 py-6 text-sm text-text-tertiary text-center">{t('maps_place_reviews_unavailable', { defaultValue: 'Les avis ne sont pas disponibles pour ce lieu.' })}</p>
  }

  return (
    <div className="px-4 py-3">
      {!adding ? (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} className="w-full">
          <MessageSquarePlus size={15} /> {t('maps_review_add', { defaultValue: 'Donner un avis' })}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-2">
          <Stars n={rating} size={24} onPick={setRating} />
          <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder={t('maps_review_comment', { defaultValue: 'Votre avis (optionnel)…' })} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>{t('common_cancel', { defaultValue: 'Annuler' })}</Button>
            <Button variant="primary" size="sm" onClick={submit}>{t('maps_review_publish', { defaultValue: 'Publier' })}</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col mt-2">
        {reviews.map(r => (
          <div key={r.id} className="group flex items-start gap-3 py-3 border-t border-border first:border-t-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Stars n={r.rating} size={14} />
                <span className="text-xs text-text-tertiary">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {r.comment && <p className="text-sm text-text-primary leading-snug mt-1 whitespace-pre-wrap break-words">{r.comment}</p>}
            </div>
            {me?.id === r.owner_id && (
              <button type="button" onClick={() => remove(r.id)} title={t('common_delete', { defaultValue: 'Supprimer' })}
                className="text-text-tertiary flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '' }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {reviews.length === 0 && !adding && (
          <p className="text-sm text-text-tertiary text-center py-4">{t('maps_reviews_empty', { defaultValue: 'Aucun avis pour le moment. Soyez le premier !' })}</p>
        )}
      </div>
    </div>
  )
}
