/**
 * Code-behind of `MapsPlaceHeader.kbview` (converted from `MapsPlaceHeader.tsx`).
 *
 * Top of the place panel: hero photo (the search pill floats over its top band), title, a rating line from
 * the module's own reviews, a category line and the tab strip.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'
import type { TabDef } from '@ui'

import { ViewBase } from './MapsPlaceHeader.kbview'
import * as __parts from './MapsPlaceHeader.parts.tsx'
import { Stars } from './MapsPlaceReviews'
import type { PlaceInfo, PlacePhoto } from '../services/geocoding'

export type PlaceTab = 'overview' | 'reviews' | 'about' | 'tickets'

/** Height of the hero photo, and the transparent band at its top reserved for the floating search pill. */
export const HERO_HEIGHT = 250
export const PILL_BAND = 64

export interface MapsPlaceHeaderProps {
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
}

export class MapsPlaceHeader extends ViewBase {
  tr!: MapsPlaceHeaderStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  private get hasPhoto() { return !!this.props.media?.photo && !this.props.imgFailed }
  get loading() { return this.props.media === null }

  get hero_class() {
    const tall = this.hasPhoto || this.loading
    return `relative bg-surface-2 overflow-hidden ${tall ? 'h-[250px]' : 'h-[116px]'}`
  }

  get show_photo() { return this.hasPhoto }
  get photo_src() { return this.props.media?.photo ?? '' }
  get show_credit() { return this.hasPhoto && !!this.props.media?.credit }
  get credit() { return this.props.media?.credit ?? '' }
  get close_label() { return this.tr('common_close', { defaultValue: 'Fermer' }) }

  get Stars() { return Stars }

  get show_rated() { return this.props.reviewAvg != null }
  get avg_text() { return this.props.reviewAvg != null ? this.props.reviewAvg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' }
  get avg_stars_props() { return this.memo('avg_stars_props', [this.props.reviewAvg], () => ({ n: this.props.reviewAvg ?? 0, size: 14 })) }
  get count_text() { return `(${this.props.reviewCount.toLocaleString('fr-FR')})` }
  get rating_hint() { return this.tr('maps_place_rating_hint', { defaultValue: 'Note moyenne des avis laissés sur Kubuno' }) }

  get show_unrated() { return this.props.reviewAvg == null }
  get no_reviews_label() { return this.tr('maps_place_no_reviews', { defaultValue: 'Aucun avis' }) }
  get add_review_label() { return this.tr('maps_review_add', { defaultValue: 'Donner un avis' }) }

  get show_class_stars() { return !!this.props.d.stars }
  get rows_class_stars() {
    return this.memo('rows_class_stars', [this.props.d.stars], () => {
      const n = Math.min(5, parseInt(this.props.d.stars ?? '', 10) || 0)
      return Array.from({ length: n }, (_, i) => ({ key: String(i) }))
    })
  }

  get show_wheelchair() { return this.props.d.wheelchair === 'yes' }
  get access_label() { return this.tr('maps_access_yes', { defaultValue: 'Accessible en fauteuil roulant' }) }

  get Tabs() { return __parts.PlaceTabs }
  get tabs_props() {
    return this.memo('tabs_props', [this.props.tabs, this.props.tab, this.props.onTab, this.tr], () => ({
      tabs: this.props.tabs,
      value: this.props.tab,
      onChange: this.props.onTab,
      t: this.tr,
    }))
  }

  img_error() { this.props.onImgError() }
  close(_s: unknown, _a: MouseEventArgs) { this.props.onClose() }
  reviews_click(_s: unknown, _a: MouseEventArgs) { this.props.onReviewsClick() }
  add_review(_s: unknown, _a: MouseEventArgs) { this.props.onAddReview() }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPlaceHeaderStores = ReturnType<MapsPlaceHeader['useStores']>

export default MapsPlaceHeader.component()
