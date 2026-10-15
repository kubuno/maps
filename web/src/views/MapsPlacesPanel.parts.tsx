/**
 * React parts of `MapsPlacesPanel.kbview`: the per-row saved-place editor (`PlaceRow` — collapsible, with a
 * `<select>`, tag `<input>` and note `<textarea>`), the "new list" form (name input + colour swatches), the
 * coloured chip dot (dynamic inline background) and the GeoJSON file picker. Each renders in a `<ReactHost>`.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Check, ChevronDown, ChevronUp, Tag, Plus, Upload } from 'lucide-react'
import { SKETCH_COLORS } from '../services/mapSketch'
import type { PlaceItem, Collection, PlacePatch } from './MapsPlacesPanel'

/** A saved-place row, with a collapsible editor (list, tags, note). */
export function PlaceRow({ place, collections, onFly, onDelete, onUpdate }: {
  place: PlaceItem; collections: Collection[]
  onFly: (lat: number, lng: number) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: PlacePatch) => void
}) {
  const { t } = useTranslation('maps')
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(place.user_note ?? '')
  const [tags, setTags] = useState((place.user_tags ?? []).join(', '))

  const save = () => {
    onUpdate(place.id, { user_note: note, user_tags: tags.split(',').map(s => s.trim()).filter(Boolean) })
    setOpen(false)
  }

  return (
    <div className="rounded-lg hover:bg-surface-1">
      <div className="group flex items-center gap-2 px-2 py-2">
        <span className="text-base flex-shrink-0 cursor-pointer" onClick={() => onFly(place.lat, place.lng)}>{place.icon}</span>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onFly(place.lat, place.lng)}>
          <p className="text-xs font-medium text-text-primary truncate">{place.name}</p>
          {place.address && <p className="text-[10px] text-text-tertiary truncate">{place.address}</p>}
          {place.user_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {place.user_tags.map(tg => (
                <span key={tg} className="text-[10px] px-1.5 py-px rounded-full bg-surface-2 text-text-secondary">{tg}</span>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)} className="p-1 text-text-tertiary hover:text-primary flex-shrink-0">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <button onClick={() => onDelete(place.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger text-text-tertiary transition-opacity flex-shrink-0">
          <Trash2 size={12} />
        </button>
      </div>
      {open && (
        <div className="px-2 pb-2.5 flex flex-col gap-2">
          <select
            value={place.collection_id ?? ''}
            onChange={e => onUpdate(place.id, { collection_id: e.target.value || null })}
            className="w-full px-2 py-1 rounded-lg border border-border bg-surface-0 text-xs focus:outline-none focus:border-primary"
          >
            <option value="">{t('maps_place_no_list', { defaultValue: 'Aucune liste' })}</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative">
            <Tag size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input value={tags} onChange={e => setTags(e.target.value)} onBlur={save}
              placeholder={t('maps_place_tags', { defaultValue: 'étiquettes, séparées, virgules' })}
              className="w-full pl-7 pr-2 py-1 rounded-lg border border-border bg-surface-0 text-xs focus:outline-none focus:border-primary" />
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={save} rows={2}
            placeholder={t('maps_place_note', { defaultValue: 'Note personnelle…' })}
            className="w-full px-2 py-1 rounded-lg border border-border bg-surface-0 text-xs resize-none focus:outline-none focus:border-primary" />
          <button onClick={save} className="self-end flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary-hover">
            <Check size={11} /> {t('common_save', { defaultValue: 'Enregistrer' })}
          </button>
        </div>
      )}
    </div>
  )
}

/** The coloured dot of a collection chip (dynamic inline background). */
export function ChipDot({ color }: { color: string }) {
  return <span className="w-2 h-2 rounded-full" style={{ background: color }} />
}

/** "New list" form: name + colour swatches + create (self-contained state). */
export function CreateListForm({ onCreate }: { onCreate: (name: string, color: string) => void }) {
  const { t } = useTranslation('maps')
  const [name, setName] = useState('')
  const [color, setColor] = useState(SKETCH_COLORS[2])
  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-surface-1">
      <input value={name} onChange={e => setName(e.target.value)} autoFocus
        placeholder={t('maps_list_name', { defaultValue: 'Nom de la liste' })}
        className="w-full px-2 py-1 rounded border border-border bg-surface-0 text-xs focus:outline-none focus:border-primary" />
      <div className="flex items-center gap-1.5">
        {SKETCH_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-text-primary scale-110' : 'border-white'}`}
            style={{ background: c }} />
        ))}
        <button onClick={() => { if (name.trim()) { onCreate(name.trim(), color); setName('') } }}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary-hover">
          <Plus size={11} /> {t('common_create', { defaultValue: 'Créer' })}
        </button>
      </div>
    </div>
  )
}

/** The GeoJSON file picker (hidden input + trigger). */
export function PlacesImport({ title, onImport }: { title: string; onImport: (file: File) => void }) {
  let input: HTMLInputElement | null = null
  return (
    <>
      <button onClick={() => input?.click()} title={title}
        className="p-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-1"><Upload size={14} /></button>
      <input ref={el => { input = el }} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = '' }} />
    </>
  )
}
