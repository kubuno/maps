import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, RefreshCw, X, MapPin } from 'lucide-react'
import { mapNominatimResult, buildNominatimSearchUrl, type SearchResult } from './geocoding'

// Champ d'autocomplétion d'adresse (géocodage Nominatim). Utilisé pour saisir le
// départ / l'arrivée d'un itinéraire via une recherche, façon Google Maps.
export function MapsAddressInput({
  value, placeholder, accent, onSelect, onClear,
}: {
  value:       string | null                 // libellé affiché quand un lieu est sélectionné
  placeholder: string
  accent?:     string                        // couleur de la pastille (A/B)
  onSelect:    (r: SearchResult) => void
  onClear?:    () => void
}) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(buildNominatimSearchUrl(query, 6))
      const raw: Array<Record<string, unknown>> = await res.json()
      setResults(raw.map(mapNominatimResult))
      setOpen(true)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  const onChange = (val: string) => {
    setQ(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 400)
  }

  // Fermer la liste au clic extérieur.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (r: SearchResult) => {
    onSelect(r)
    setQ(''); setResults([]); setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border focus-within:border-primary transition-colors bg-surface-0">
        {accent
          ? <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: accent }}>{placeholder.slice(0, 1)}</span>
          : <Search size={14} className="text-text-tertiary flex-shrink-0" />}
        {value ? (
          <>
            <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{value}</span>
            {onClear && (
              <button onClick={onClear} className="text-text-tertiary hover:text-text-primary flex-shrink-0"><X size={13} /></button>
            )}
          </>
        ) : (
          <input
            value={q}
            onChange={e => onChange(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-text-tertiary"
          />
        )}
        {loading && <RefreshCw size={12} className="text-text-tertiary animate-spin flex-shrink-0" />}
      </div>

      {open && results.length > 0 && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[1200] bg-surface-0 rounded-lg border border-border shadow-xl max-h-64 overflow-y-auto py-1">
          {results.map(r => (
            <button key={r.place_id} onClick={() => select(r)}
              className="w-full flex items-start gap-2 px-2.5 py-2 text-left hover:bg-surface-1 transition-colors">
              <MapPin size={13} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <span className="text-xs text-text-primary leading-snug line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
