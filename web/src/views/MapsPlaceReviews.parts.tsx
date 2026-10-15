/**
 * React part of `MapsPlaceReviews.kbview`: the star row, whose per-star fill/colour is dynamic and (when
 * `onPick` is given) clickable — no .kbview element expresses that, so it stays React. Re-exported by the
 * code-behind for other screens (`MapsPlaceHeader`) that import `Stars`.
 */
import { Star } from 'lucide-react'

/** Star row (read-only, or clickable when `onPick` is given). Amber like the header rating. */
export function Stars({ n, size = 13, onPick }: { n: number; size?: number; onPick?: (v: number) => void }) {
  return (
    <span className="inline-flex" aria-hidden={!onPick}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(n) ? 'currentColor' : 'none'}
          strokeWidth={1.75}
          style={{ color: i <= Math.round(n) ? '#fbbc04' : '#dadce0' }}
          className={onPick ? 'cursor-pointer' : ''}
          onClick={onPick ? () => onPick(i) : undefined} />
      ))}
    </span>
  )
}
