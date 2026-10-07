import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Smartphone, Link, Printer } from 'lucide-react'
import { useToast } from '@ui'
import { MapsQrDialog } from './MapsQrDialog'
import { hoverBg, BUTTON_HOVER } from './MapsSearchDropdown'
import { routeShareUrl } from './routeLink'
import type { LatLng } from './routing'
import type { RouteMode } from './useRouteModes'

/** Row of text actions above the results: send to a phone, copy the link, print. */
export function MapsRouteActions({ waypoints, mode, summary, onPrint }: {
  waypoints: (LatLng | null)[]
  mode:      RouteMode
  /** Human summary of the selected route (under the QR code). */
  summary:   string
  onPrint:   () => void
}) {
  const { t } = useTranslation('maps')
  const toast = useToast()
  const [qrOpen, setQrOpen] = useState(false)
  const url = routeShareUrl(waypoints, mode)

  const copyLink = () => {
    navigator.clipboard?.writeText(url).catch(() => {})
    toast.success(t('maps_place_link_copied', { defaultValue: 'Lien copié' }), { id: 'maps-share' })
  }
  const btn = 'flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium text-primary'

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-1 no-print">
        <button type="button" onClick={() => setQrOpen(true)} {...hoverBg(BUTTON_HOVER)} className={btn}>
          <Smartphone size={16} /> {t('maps_route_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' })}
        </button>
        <button type="button" onClick={copyLink} {...hoverBg(BUTTON_HOVER)} className={btn}>
          <Link size={16} /> {t('maps_route_copy_link', { defaultValue: 'Copier le lien' })}
        </button>
        <button type="button" onClick={onPrint} {...hoverBg(BUTTON_HOVER)} className={btn}>
          <Printer size={16} /> {t('maps_route_print', { defaultValue: 'Imprimer' })}
        </button>
      </div>
      {qrOpen && (
        <MapsQrDialog url={url} title={summary} onClose={() => setQrOpen(false)} onCopy={copyLink}
          hint={t('maps_route_send_to_phone_hint', { defaultValue: "Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir cet itinéraire dans Kubuno." })} />
      )}
    </>
  )
}
