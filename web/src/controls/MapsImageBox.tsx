// MapsImageBox — the native element behind the `.kbview` <Image> project control
// (src/kbview-controls.json, dom_root:"ref"). The registry has no image element, so an <img> stays a
// small React host control: the renderer sizes/positions the forwarded ref, the component draws the image
// and handles the error→fallback swap (same idea as PaintBox for a <canvas>).
import { forwardRef, useEffect, useState } from 'react'

export interface MapsImageBoxProps {
  /** Image URL (the `Src` property). */
  src?:      string
  /** URL swapped in when `src` fails to load (the `FallbackSrc` property). */
  fallback?: string
  alt?:      string
  /** object-fit (the `Fit` property): "cover" (default) or "contain". */
  fit?:      string
  /** Raised when the image fails to load (the `OnError` event). */
  onError?:  () => void
  className?: string
  style?:    React.CSSProperties
}

export const MapsImageBox = forwardRef<HTMLImageElement, MapsImageBoxProps>(function MapsImageBox(
  { src, fallback, alt = '', fit, onError, className, style }, ref,
) {
  const [failed, setFailed] = useState(false)
  // A new src is a fresh attempt: clear the previous failure.
  useEffect(() => { setFailed(false) }, [src])
  const shown = failed && fallback ? fallback : src
  return (
    <img
      ref={ref}
      src={shown}
      alt={alt}
      draggable={false}
      onError={() => { setFailed(true); onError?.() }}
      className={className}
      style={{ objectFit: (fit as React.CSSProperties['objectFit']) || 'cover', ...style }}
    />
  )
})
