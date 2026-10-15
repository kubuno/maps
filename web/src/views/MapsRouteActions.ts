/**
 * Code-behind of `MapsRouteActions.kbview` (converted from `MapsRouteActions.tsx`).
 *
 * Row of text actions above the route results: send to a phone (QR), copy the link, print.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'
import { useToast } from '@ui'

import { ViewBase } from './MapsRouteActions.kbview'
import MapsQrDialog from '../dialogs/MapsQrDialog'
import { routeShareUrl } from '../services/routeLink'
import type { LatLng } from '../services/routing'
import type { RouteMode } from '../maps-app/useRouteModes'

export interface MapsRouteActionsProps {
  waypoints: (LatLng | null)[]
  mode:      RouteMode
  /** Human summary of the selected route (under the QR code). */
  summary:   string
  onPrint:   () => void
}

export class MapsRouteActions extends ViewBase {
  @bind accessor qrOpen = false
  tr!: MapsRouteActionsStores['t']
  toast!: MapsRouteActionsStores['toast']

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
    return this.memo('url', [this.props.waypoints, this.props.mode], () => routeShareUrl(this.props.waypoints, this.props.mode))
  }

  get send_label() {
    return this.tr('maps_route_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' })
  }

  get copy_label() {
    return this.tr('maps_route_copy_link', { defaultValue: 'Copier le lien' })
  }

  get print_label() {
    return this.tr('maps_route_print', { defaultValue: 'Imprimer' })
  }

  get Qr() {
    return MapsQrDialog
  }

  get qr_props() {
    return this.memo('qr_props', [this.url, this.props.summary, this.tr], () => ({
      url: this.url,
      title: this.props.summary,
      hint: this.tr('maps_route_send_to_phone_hint', { defaultValue: "Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir cet itinéraire dans Kubuno." }),
      onClose: this.memo('closeQr:bound', [], () => this.closeQr.bind(this)),
      onCopy: this.memo('copyLink:bound', [], () => this.copyLink.bind(this)),
    }))
  }

  copyLink() {
    navigator.clipboard?.writeText(this.url).catch(() => {})
    this.toast.success(this.tr('maps_place_link_copied', { defaultValue: 'Lien copié' }), { id: 'maps-share' })
  }

  closeQr() {
    this.qrOpen = false
  }

  open_qr(_sender: unknown, _args: MouseEventArgs) {
    this.qrOpen = true
  }

  copy(_sender: unknown, _args: MouseEventArgs) {
    this.copyLink()
  }

  print(_sender: unknown, _args: MouseEventArgs) {
    this.props.onPrint()
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsRouteActionsStores = ReturnType<MapsRouteActions['useStores']>

export default MapsRouteActions.component()
