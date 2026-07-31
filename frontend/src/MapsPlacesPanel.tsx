import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Star, Trash2, Plus, Search, Download, Upload, Clock, X, Check,
  ChevronDown, ChevronUp, FolderPlus, Tag,
} from 'lucide-react'
import { SKETCH_COLORS } from './mapSketch'

export interface PlaceItem {
  id: string; name: string; address: string | null; lat: number; lng: number
  icon: string; category: string | null; user_note: string | null
  user_tags: string[]; collection_id: string | null
}
export interface Collection { id: string; name: string; icon: string; color: string; place_count: number }
export interface HistoryEntry {
  id: string; query: string; result_name: string | null
  result_lat: number | null; result_lng: number | null; searched_at: string
}

export interface PlacePatch { collection_id?: string | null; user_note?: string; user_tags?: string[]; name?: string }

// Ligne d'un lieu enregistré, avec éditeur dépliable (liste, étiquettes, note).
function PlaceRow({
  place, collections, onFly, onDelete, onUpdate,
}: {
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
    onUpdate(place.id, {
      user_note: note,
      user_tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    })
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

export function MapsPlacesPanel({
  places, collections, history,
  onFly, onDelete, onUpdate, onCreateCollection, onDeleteCollection,
  onExport, onImport, onClearHistory,
}: {
  places: PlaceItem[]; collections: Collection[]; history: HistoryEntry[]
  onFly: (lat: number, lng: number) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: PlacePatch) => void
  onCreateCollection: (name: string, color: string) => void
  onDeleteCollection: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onClearHistory: () => void
}) {
  const { t } = useTranslation('maps')
  const [filter, setFilter] = useState<string>('all')   // 'all' | 'none' | collectionId
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SKETCH_COLORS[2])
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return places.filter(p => {
      if (filter === 'none' && p.collection_id) return false
      if (filter !== 'all' && filter !== 'none' && p.collection_id !== filter) return false
      if (needle && !(`${p.name} ${(p.user_tags ?? []).join(' ')} ${p.address ?? ''}`.toLowerCase().includes(needle))) return false
      return true
    })
  }, [places, filter, q])

  const Chip = ({ id, label, color, count }: { id: string; label: string; color?: string; count?: number }) => (
    <button onClick={() => setFilter(id)}
      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
        filter === id ? 'bg-primary text-white border-primary' : 'bg-surface-0 text-text-secondary border-border hover:bg-surface-1'
      }`}>
      {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}{typeof count === 'number' && <span className="opacity-70">{count}</span>}
    </button>
  )

  return (
    <div className="flex flex-col gap-2.5">
      {/* Filtres par liste */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        <Chip id="all"  label={t('maps_places_all', { defaultValue: 'Tous' })} count={places.length} />
        {collections.map(c => (
          <span key={c.id} className="group/chip relative flex-shrink-0">
            <Chip id={c.id} label={c.name} color={c.color} count={c.place_count} />
            <button onClick={() => onDeleteCollection(c.id)} title={t('common_delete', { defaultValue: 'Supprimer' })}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-danger text-white items-center justify-center hidden group-hover/chip:flex">
              <X size={9} />
            </button>
          </span>
        ))}
        <Chip id="none" label={t('maps_places_no_list', { defaultValue: 'Sans liste' })} />
        <button onClick={() => setCreating(c => !c)} title={t('maps_list_new', { defaultValue: 'Nouvelle liste' })}
          className="flex items-center justify-center w-7 h-7 rounded-full border border-border text-text-secondary hover:bg-surface-1 flex-shrink-0">
          <FolderPlus size={13} />
        </button>
      </div>

      {/* Création de liste */}
      {creating && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-surface-1">
          <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
            placeholder={t('maps_list_name', { defaultValue: 'Nom de la liste' })}
            className="w-full px-2 py-1 rounded border border-border bg-surface-0 text-xs focus:outline-none focus:border-primary" />
          <div className="flex items-center gap-1.5">
            {SKETCH_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${newColor === c ? 'border-text-primary scale-110' : 'border-white'}`}
                style={{ background: c }} />
            ))}
            <button onClick={() => { if (newName.trim()) { onCreateCollection(newName.trim(), newColor); setNewName(''); setCreating(false) } }}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary-hover">
              <Plus size={11} /> {t('common_create', { defaultValue: 'Créer' })}
            </button>
          </div>
        </div>
      )}

      {/* Recherche + import/export */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder={t('maps_places_search', { defaultValue: 'Filtrer mes lieux…' })}
            className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-border bg-surface-0 text-xs focus:outline-none focus:border-primary" />
        </div>
        <button onClick={onExport} title={t('maps_places_export', { defaultValue: 'Exporter (GeoJSON)' })}
          className="p-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-1"><Download size={14} /></button>
        <button onClick={() => fileRef.current?.click()} title={t('maps_places_import', { defaultValue: 'Importer' })}
          className="p-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-1"><Upload size={14} /></button>
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
      </div>

      {/* Liste des lieux */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-text-tertiary">
          <Star size={22} className="opacity-30" />
          <p className="text-xs text-center">{t('maps_places_empty')}<br />{t('maps_places_empty_hint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {filtered.map(p => (
            <PlaceRow key={p.id} place={p} collections={collections} onFly={onFly} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      )}

      {/* Récents (historique de recherche) */}
      {history.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between mb-1 px-1">
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary flex items-center gap-1"><Clock size={11} /> {t('maps_recent', { defaultValue: 'Récents' })}</p>
            <button onClick={onClearHistory} className="text-[10px] text-text-tertiary hover:text-danger">{t('maps_recent_clear', { defaultValue: 'Effacer' })}</button>
          </div>
          <div className="flex flex-col gap-0.5">
            {history.slice(0, 10).map(h => (
              <button key={h.id}
                onClick={() => h.result_lat != null && h.result_lng != null && onFly(h.result_lat, h.result_lng)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-1 text-left">
                <Clock size={12} className="text-text-tertiary flex-shrink-0" />
                <span className="flex-1 min-w-0 text-xs text-text-secondary truncate">{h.result_name || h.query}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
