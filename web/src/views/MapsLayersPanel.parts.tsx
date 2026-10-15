/**
 * React parts of `MapsLayersPanel.kbview`: the per-tile glyph (chosen by name from a Lucide set) and the
 * offline-download progress bar (a dynamic inline width, which no .kbview class expresses). Each is rendered
 * by a `<ReactHost>`, plus the `.geojson`/`.kml` file picker (hidden `<input>` + ref).
 */
import { useRef } from 'react'
import { Bike, Bus, CloudRain, Mountain, Map as MapIcon, Sun, Satellite, WifiOff, Upload } from 'lucide-react'

const ICONS = { Bike, Bus, CloudRain, Mountain, Map: MapIcon, Sun, Satellite, WifiOff }

export function TileIcon({ name }: { name: keyof typeof ICONS }) {
  const Icon = ICONS[name]
  return <Icon size={26} />
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / Math.max(1, total)) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-text-tertiary">{done}/{total}</span>
    </div>
  )
}

export function LayerImport({ label, onImport }: { label: string; onImport: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary text-xs hover:bg-surface-3 transition-colors">
        <Upload size={13} /> {label}
      </button>
      <input ref={fileRef} type="file" accept=".geojson,.json,.kml,application/geo+json,application/json"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
    </>
  )
}
