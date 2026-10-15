import type { SVGProps } from 'react'

/**
 * "Directions" glyph: a rounded diamond enclosing an arrow that turns right —
 * the conventional route symbol of map apps (lucide has no equivalent). Drawn
 * on the same 24×24 grid, stroke 2, as lucide icons so it sits next to them.
 */
export function DirectionsIcon({ size = 20, strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Rounded diamond */}
      <path d="M10.6 3.4a2 2 0 0 1 2.8 0l7.2 7.2a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8z" />
      {/* Arrow rising then turning right */}
      <path d="M9 16v-3.5a2 2 0 0 1 2-2h4.5" />
      <path d="M13.5 8.5 15.5 10.5 13.5 12.5" />
    </svg>
  )
}
