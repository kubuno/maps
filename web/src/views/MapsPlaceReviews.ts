/**
 * Code-behind of `MapsPlaceReviews.kbview` (converted from `MapsPlaceReviews.tsx`).
 *
 * "Reviews" tab: the add form and the list (delete own reviews). Reviews are stored by the module backend
 * (`/maps/reviews*`), keyed by OSM type + id.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'
import { api, useAuthStore } from '@kubuno/sdk'

import { ViewBase } from './MapsPlaceReviews.kbview'
import * as __parts from './MapsPlaceReviews.parts.tsx'

// Re-exported for MapsPlaceHeader, which renders the same star row.
export { Stars } from './MapsPlaceReviews.parts.tsx'

export interface Review { id: string; owner_id: string; rating: number; comment: string | null; created_at: string }

export interface MapsPlaceReviewsProps {
  reviews:   Review[]
  osmType:   string | null
  osmId:     number | null
  placeName: string
  onChanged: () => void
  /** Open the form right away ("Donner un avis" link in the header). */
  autoOpen?: boolean
}

export class MapsPlaceReviews extends ViewBase {
  @bind accessor adding = false
  @bind accessor rating = 5
  @bind accessor comment = ''
  /** One-shot guard so `autoOpen` seeds `adding` only on the first render (like `useState(!!autoOpen)`). */
  private seeded = false
  tr!: MapsPlaceReviewsStores['t']
  me!: MapsPlaceReviewsStores['me']

  useStores() {
    const { t } = useTranslation('maps')
    const me = useAuthStore(s => s.user)
    return { t, me }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, me: s.me })
    if (!this.seeded) {
      this.seeded = true
      this.adding = !!this.props.autoOpen
    }
  }

  get canReview() {
    return !!this.props.osmType && this.props.osmId != null
  }

  get show_unavailable() {
    return !this.canReview
  }

  get show_body() {
    return this.canReview
  }

  get show_add_button() {
    return !this.adding
  }

  get Stars() {
    return __parts.Stars
  }

  get rating_stars_props() {
    return this.memo('rating_stars_props', [this.rating], () => ({
      n: this.rating,
      size: 24,
      onPick: this.memo('setRating:bound', [], () => this.setRating.bind(this)),
    }))
  }

  get unavailable_label() {
    return this.tr('maps_place_reviews_unavailable', { defaultValue: 'Les avis ne sont pas disponibles pour ce lieu.' })
  }

  get add_label() {
    return this.tr('maps_review_add', { defaultValue: 'Donner un avis' })
  }

  get comment_placeholder() {
    return this.tr('maps_review_comment', { defaultValue: 'Votre avis (optionnel)…' })
  }

  get cancel_label() {
    return this.tr('common_cancel', { defaultValue: 'Annuler' })
  }

  get publish_label() {
    return this.tr('maps_review_publish', { defaultValue: 'Publier' })
  }

  get empty_label() {
    return this.tr('maps_reviews_empty', { defaultValue: 'Aucun avis pour le moment. Soyez le premier !' })
  }

  get show_empty() {
    return this.props.reviews.length === 0 && !this.adding
  }

  get rows_reviews() {
    return this.memo('rows_reviews', [this.props.reviews, this.me, this.tr], () => {
      const delete_label = this.tr('common_delete', { defaultValue: 'Supprimer' })
      const myId = this.me?.id
      return this.props.reviews.map(r => ({
        key: r.id,
        review: r,
        Stars: __parts.Stars,
        stars_props: { n: r.rating, size: 14 },
        date: new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
        comment: r.comment ?? '',
        show_comment: !!r.comment,
        can_delete: myId === r.owner_id,
        delete_label,
      }))
    })
  }

  setRating(v: number) {
    this.rating = v
  }

  start_add(_sender: unknown, _args: MouseEventArgs) {
    this.adding = true
  }

  cancel_add(_sender: unknown, _args: MouseEventArgs) {
    this.adding = false
  }

  async submit(_sender: unknown, _args: MouseEventArgs) {
    if (!this.canReview) return
    try {
      await api.post('/maps/reviews', {
        osm_type: this.props.osmType, osm_id: this.props.osmId, place_name: this.props.placeName,
        rating: this.rating, comment: this.comment.trim() || null,
      })
      this.adding = false
      this.comment = ''
      this.rating = 5
      this.props.onChanged()
    } catch {/* ignore */}
  }

  async remove(_sender: unknown, args: MouseEventArgs) {
    const { review } = (args as MouseEventArgs & { row: RowOfReviews }).row
    try { await api.delete(`/maps/reviews/${review.id}`); this.props.onChanged() } catch {/* ignore */}
  }
}

type RowOfReviews = MapsPlaceReviews['rows_reviews'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPlaceReviewsStores = ReturnType<MapsPlaceReviews['useStores']>

export default MapsPlaceReviews.component()
