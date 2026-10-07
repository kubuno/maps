import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Smartphone } from 'lucide-react'
import { FloatingWindow } from '@ui'
import { encodeQr, qrSvgPath } from './qrcode'

/**
 * "Send to a phone": QR code of a share link so a phone opens it by scanning.
 * Shared by the place panel (link to a place) and the route panel (link to a
 * route); the caller words the hint for what the link opens.
 */
export function MapsQrDialog({ url, title, hint, onClose, onCopy }: {
  url:     string
  /** Line under the code (the place name, the route summary…). */
  title:   string
  /** Explains what scanning opens. */
  hint:    string
  onClose: () => void
  onCopy:  () => void
}) {
  const { t } = useTranslation('maps')
  const qr = useMemo(() => { const m = encodeQr(url); return m ? qrSvgPath(m) : null }, [url])
  return (
    <FloatingWindow
      title={t('maps_place_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' })}
      icon={<Smartphone size={16} />}
      onClose={onClose} defaultWidth={360} minWidth={300} resizable={false} backdrop padding={20} t={t}
      actions={{ confirm: { label: t('maps_place_copy_link', { defaultValue: 'Copier le lien' }), onClick: onCopy }, cancel: { label: t('common_close', { defaultValue: 'Fermer' }) } }}>
      <div className="flex flex-col items-center gap-3 text-center">
        {qr ? (
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={220} height={220} shapeRendering="crispEdges" role="img"
            aria-label={t('maps_place_qr_alt', { defaultValue: 'Code QR du lien' })} className="rounded-lg bg-white">
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.d} fill="#202124" />
          </svg>
        ) : (
          <p className="text-sm text-text-secondary">{t('maps_place_qr_too_long', { defaultValue: 'Le lien est trop long pour un code QR.' })}</p>
        )}
        <p className="text-sm" style={{ color: '#202124' }}>{title}</p>
        <p className="text-sm text-text-secondary">{hint}</p>
        <p className="text-xs text-text-tertiary break-all select-all">{url}</p>
      </div>
    </FloatingWindow>
  )
}
