import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { Search, RefreshCw, X, MapPin } from 'lucide-react'
import { buildNominatimSearchUrl, type SearchResult } from './geocoding'
import { fetchResults } from './searchRows'

/** Hover tint via inline style: `hover:` utilities can lose against the host's layer. */
const hoverBg = (color: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})

// Address autocomplete field (Nominatim geocoding). Used for the origin /
// stops / destination of a route and for the saved-place editor.
//   - `size="sm"` (default): compact field of the saved-place editor;
//   - `size="lg"`: 56 px field of the route panel — 1 px grey border, 2 px
//     primary ring when focused, search icon inside while focused and empty.
export function MapsAddressInput({
  value, placeholder, accent, size = 'sm', leading, trailing, autoFocus,
  onSelect, onClear, onFocusChange, onTyping,
}: {
  value:       string | null                 // label shown once a place is selected
  placeholder: string
  accent?:     string                        // colour of the A/B badge (sm only)
  size?:       'sm' | 'lg'
  /** Extra element at the left edge, inside the frame (e.g. a drag handle). */
  leading?:    ReactNode
  /** Extra element at the right edge (after the search / clear icon). */
  trailing?:   ReactNode
  autoFocus?:  boolean
  onSelect:    (r: SearchResult) => void
  onClear?:    () => void
  /** Focus entered / left the text input. */
  onFocusChange?: (focused: boolean) => void
  /** The user is typing a query (≥ 2 chars) — the caller may hide its own suggestions. */
  onTyping?:   (typing: boolean) => void
}) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)
  const timer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const seq    = useRef(0)   // drops out-of-order responses

  const search = useCallback(async (query: string) => {
    const id = ++seq.current
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const rows = await fetchResults(buildNominatimSearchUrl(query, 6))
      if (id !== seq.current) return
      setResults(rows)
      setOpen(true)
    } catch { if (id === seq.current) setResults([]) }
    finally { if (id === seq.current) setLoading(false) }
  }, [])

  const onChange = (val: string) => {
    setQ(val)
    onTyping?.(val.trim().length >= 2)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  // Close the list on an outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (r: SearchResult) => {
    onSelect(r)
    setQ(''); setResults([]); setOpen(false)
    onTyping?.(false)
  }

  const lg = size === 'lg'
  const frame = lg
    ? `flex items-center gap-3 h-14 ${leading ? 'pl-2' : 'pl-4'} pr-2 rounded-lg border bg-surface-0 transition-[border-color,box-shadow] ${
        focused ? 'border-primary' : 'border-border'}`
    : 'flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border focus-within:border-primary transition-colors bg-surface-0'
  const textCls = lg ? 'text-sm' : 'text-xs'
  const iconBtn = lg
    ? 'w-9 h-9 rounded-full flex items-center justify-center text-text-secondary flex-shrink-0'
    : 'text-text-tertiary flex-shrink-0'

  return (
    <div ref={boxRef} className="relative">
      <div className={frame} style={lg && focused ? { boxShadow: 'inset 0 0 0 1px var(--color-primary)' } : undefined}>
        {leading}
        {!lg && (accent
          ? <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: accent }}>{placeholder.slice(0, 1)}</span>
          : <Search size={14} className="text-text-tertiary flex-shrink-0" />)}
        {value ? (
          <>
            <span className={`flex-1 min-w-0 ${textCls} text-text-primary truncate`} title={value}>{value}</span>
            {onClear && (
              <button type="button" onClick={onClear} className={iconBtn} {...(lg ? hoverBg('var(--color-surface-2, #f1f3f4)') : {})}>
                <X size={lg ? 18 : 13} />
              </button>
            )}
          </>
        ) : (
          <>
            <input
              value={q}
              autoFocus={autoFocus}
              onChange={e => onChange(e.target.value)}
              onFocus={() => { setFocused(true); onFocusChange?.(true); if (results.length) setOpen(true) }}
              onBlur={() => { setFocused(false); onFocusChange?.(false) }}
              placeholder={placeholder}
              className={`flex-1 min-w-0 bg-transparent ${textCls} text-text-primary focus:outline-none placeholder:text-text-secondary`}
            />
            {lg && focused && !loading && <Search size={20} className="text-text-secondary flex-shrink-0 mr-2" />}
          </>
        )}
        {loading && <RefreshCw size={lg ? 16 : 12} className="text-text-tertiary animate-spin flex-shrink-0 mr-2" />}
        {trailing}
      </div>

      {open && results.length > 0 && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[1200] bg-surface-0 rounded-lg border border-border shadow-xl max-h-72 overflow-y-auto py-1">
          {results.map(r => (
            <button key={r.place_id} type="button" onClick={() => select(r)}
              onMouseDown={e => e.preventDefault()}   // keep the focus in the input
              {...hoverBg('var(--color-surface-1, #f8f9fa)')}
              className={`w-full flex items-start gap-2.5 text-left ${lg ? 'px-4 py-3' : 'px-2.5 py-2'}`}>
              <MapPin size={lg ? 18 : 13} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <span className={`${lg ? 'text-sm' : 'text-xs'} text-text-primary leading-snug line-clamp-2`}>{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
