/**
 * React part of `MapsPlaceActions.kbview`: the round-action glyph, chosen by kind (one is a custom SVG,
 * `DirectionsIcon`, and the Save glyph toggles), so it stays React. Rendered by a `<ReactHost>`.
 */
import { Bookmark, BookmarkCheck, Locate, Smartphone, Share2 } from 'lucide-react'
import { DirectionsIcon } from '../pages/DirectionsIcon'

export function ActionIcon({ kind, saved }: { kind: string; saved?: boolean }) {
  switch (kind) {
    case 'directions': return <DirectionsIcon size={24} />
    case 'save':       return saved ? <BookmarkCheck size={22} /> : <Bookmark size={22} />
    case 'nearby':     return <Locate size={22} />
    case 'phone':      return <Smartphone size={22} />
    case 'share':      return <Share2 size={22} />
    default:           return null
  }
}
