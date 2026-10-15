/**
 * The part of `MapsQrDialog.kbview` still written in React: the inline `<svg>` QR code (and its "too long"
 * fallback), which has no .kbview element. Rendered by a `<ReactHost>` with the values it reads as props.
 */
import type { MapsQrDialog } from './MapsQrDialog'

export function QrImage({ qr, altLabel, tooLong }: {
  qr:       MapsQrDialog['qr']
  altLabel: string
  tooLong:  string
}) {
  return qr ? (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={220} height={220} shapeRendering="crispEdges" role="img"
      aria-label={altLabel} className="rounded-lg bg-white">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#202124" />
    </svg>
  ) : (
    <p className="text-sm text-text-secondary">{tooLong}</p>
  )
}
