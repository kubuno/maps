/**
 * Code-behind of `MapsPlaceActions.kbview` (converted from `MapsPlaceActions.tsx`).
 *
 * Row of five round actions (directions, save, nearby, send-to-phone, share) + the QR dialog.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'
import { useToast } from '@ui'

import { ViewBase } from './MapsPlaceActions.kbview'
import * as __parts from './MapsPlaceActions.parts.tsx'
import type { SearchResult } from '../services/geocoding'
import { copyKubunoData, placeEnvelope } from '../services/kubunoData'
import MapsQrDialog from '../dialogs/MapsQrDialog'

/**
 * Hover background driven from JS: this module's Tailwind build lands in the `kubuno-module` cascade layer,
 * below the host's `utilities` layer, so a `hover:bg-*` utility may never paint. An inline style is immune.
 * Kept exported for the screens (MapsPlaceInfo) that still use it.
 */
export const hoverBg = (color: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})

/** Share URL of a place: opens the module centred on it with the name pre-filled. */
export function placeShareUrl(lat: number, lng: number, title: string): string {
  return `${location.origin}/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}&q=${encodeURIComponent(title)}`
}

const CIRCLE = 'w-14 h-14 rounded-full flex items-center justify-center transition-colors'

export interface MapsPlaceActionsProps {
  place:     SearchResult
  lat:       number
  lng:       number
  title:     string
  saved:     boolean
  onRouteTo: () => void
  onSave:    () => void
  onNearby?: () => void
}

export class MapsPlaceActions extends ViewBase {
  @bind accessor qrOpen = false
  tr!: MapsPlaceActionsStores['t']
  toast!: MapsPlaceActionsStores['toast']

  useStores() {
    const { t } = useTranslation('maps')
    const toast = useToast()
    return { t, toast }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, toast: s.toast })
  }

  get url() {
    return this.memo('url', [this.props.lat, this.props.lng, this.props.title], () => placeShareUrl(this.props.lat, this.props.lng, this.props.title))
  }

  get filled_circle() { return `${CIRCLE} bg-primary text-white hover:bg-primary-hover` }
  get light_circle() { return `${CIRCLE} bg-primary-light text-primary hover:bg-[#c2d7fa]` }

  get ActionIcon() { return __parts.ActionIcon }
  get directions_icon_props() { return this.memo('directions_icon_props', [], () => ({ kind: 'directions' })) }
  get save_icon_props() { return this.memo('save_icon_props', [this.props.saved], () => ({ kind: 'save', saved: this.props.saved })) }
  get nearby_icon_props() { return this.memo('nearby_icon_props', [], () => ({ kind: 'nearby' })) }
  get phone_icon_props() { return this.memo('phone_icon_props', [], () => ({ kind: 'phone' })) }
  get share_icon_props() { return this.memo('share_icon_props', [], () => ({ kind: 'share' })) }

  get directions_label() { return this.tr('maps_place_directions', { defaultValue: 'Itinéraires' }) }
  get save_label() { return this.props.saved ? this.tr('maps_place_saved', { defaultValue: 'Enregistré' }) : this.tr('maps_save', { defaultValue: 'Enregistrer' }) }
  get nearby_label() { return this.tr('maps_nearby', { defaultValue: 'À proximité' }) }
  get phone_label() { return this.tr('maps_place_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' }) }
  get share_label() { return this.tr('maps_share', { defaultValue: 'Partager' }) }

  get share_items() {
    return this.memo('share_items', [this.tr, this.props.place], () => [
      { label: this.tr('maps_place_copy_link', { defaultValue: 'Copier le lien' }), iconName: 'Link', onClick: () => this.copyLink() },
      { label: this.tr('maps_place_copy_card', { defaultValue: 'Copier la fiche (à coller dans un autre module)' }), iconName: 'Copy', onClick: () => this.copyCard() },
    ])
  }

  get Qr() { return MapsQrDialog }
  get qr_props() {
    return this.memo('qr_props', [this.url, this.props.title, this.tr], () => ({
      url: this.url,
      title: this.props.title,
      hint: this.tr('maps_place_send_to_phone_hint', { defaultValue: "Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir ce lieu dans Kubuno." }),
      onClose: this.memo('closeQr:bound', [], () => this.closeQr.bind(this)),
      onCopy: this.memo('copyLink:bound', [], () => this.copyLink.bind(this)),
    }))
  }

  copyLink() {
    navigator.clipboard?.writeText(this.url).catch(() => {})
    this.toast.success(this.tr('maps_place_link_copied', { defaultValue: 'Lien copié' }), { id: 'maps-share' })
  }

  copyCard() {
    copyKubunoData(placeEnvelope(this.props.place)).catch(() => {})
    this.toast.success(this.tr('maps_place_card_copied', { defaultValue: 'Fiche du lieu copiée' }), { id: 'maps-share' })
  }

  closeQr() { this.qrOpen = false }

  route(_s: unknown, _a: MouseEventArgs) { this.props.onRouteTo() }
  save(_s: unknown, _a: MouseEventArgs) { this.props.onSave() }
  nearby(_s: unknown, _a: MouseEventArgs) { this.props.onNearby?.() }
  open_qr(_s: unknown, _a: MouseEventArgs) { this.qrOpen = true }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsPlaceActionsStores = ReturnType<MapsPlaceActions['useStores']>

export default MapsPlaceActions.component()
