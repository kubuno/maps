/**
 * Code-behind of `MapsQrDialog.kbview` (converted from `MapsQrDialog.tsx`).
 *
 * "Send to a phone": QR code of a share link so a phone opens it by scanning. Shared by the place panel
 * (link to a place) and the route panel (link to a route); the caller words the hint for what the link opens.
 */
import { type EventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsQrDialog.kbview'
import * as __parts from './MapsQrDialog.parts.tsx'
import { encodeQr, qrSvgPath } from '../services/qrcode'

export interface MapsQrDialogProps {
  url:   string
  /** Line under the code (the place name, the route summary…). */
  title: string
  /** Explains what scanning opens. */
  hint:  string
  onClose: () => void
  onCopy:  () => void
}

export class MapsQrDialog extends ViewBase {
  tr!: MapsQrDialogStores['t']

  /** The screen's hooks that read nothing of the view (stores, translations…), as the TSX called them. */
  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  /** Runs the hooks and publishes what they give as fields (the bindings, the getters and the methods read them). */
  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  get window_title() {
    return this.tr('maps_place_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' })
  }

  get copy_label() {
    return this.tr('maps_place_copy_link', { defaultValue: 'Copier le lien' })
  }

  get close_label() {
    return this.tr('common_close', { defaultValue: 'Fermer' })
  }

  /** The QR matrix as an SVG path + size, or `null` when the link is too long to encode. */
  get qr() {
    return this.memo('qr', [this.props.url], () => {
      const m = encodeQr(this.props.url)
      return m ? qrSvgPath(m) : null
    })
  }

  get QrImage() {
    return __parts.QrImage
  }

  get qr_props() {
    return this.memo('qr_props', [this.qr, this.tr], () => ({
      qr:       this.qr,
      altLabel: this.tr('maps_place_qr_alt', { defaultValue: 'Code QR du lien' }),
      tooLong:  this.tr('maps_place_qr_too_long', { defaultValue: 'Le lien est trop long pour un code QR.' }),
    }))
  }

  confirm(_sender: unknown, _args: EventArgs) {
    this.props.onCopy()
  }

  cancel(_sender: unknown, _args: EventArgs) {
    this.props.onClose()
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsQrDialogStores = ReturnType<MapsQrDialog['useStores']>

export default MapsQrDialog.component()
