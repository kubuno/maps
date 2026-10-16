/**
 * React part of `MapsGpxPanel.kbview`: the "import .gpx" button wired to a hidden file `<input>` through a
 * ref - a file picker has no .kbview element, so it stays React. Rendered by a `<ReactHost>`.
 */
import { useRef } from 'react'
import { Upload } from 'lucide-react'

export function GpxImport({ label, onUpload }: { label: string; onUpload: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-text-tertiary hover:text-primary text-xs transition-colors w-full"
      >
        <Upload size={13} /> {label}
      </button>
      <input ref={inputRef} type="file" accept=".gpx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = '' } }} />
    </>
  )
}
