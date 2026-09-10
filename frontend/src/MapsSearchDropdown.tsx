import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, Home, Clock, MapPin, Plus, Trash2, X, AlertCircle, RefreshCw } from 'lucide-react'
import { MapsAddressInput } from './MapsAddressInput'
import { formatAddress, type SearchResult } from './geocoding'
import type { HistoryEntry } from './MapsPlacesPanel'
import { savedPlaceSubtitle, type SavedPlace, type SavedPlaceKind } from './useSavedPlaces'

/** Hover tint via inline style: `hover:` utilities can lose against the host's layer. */
export const hoverBg = (color: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})
export const ROW_HOVER = 'var(--color-surface-1, #f8f9fa)'
export const BUTTON_HOVER = 'var(--color-surface-2, #f1f3f4)'

// ── Row model (shared with the keyboard navigation of MapsSearchBar) ──────────

export type SearchRow =
  | { kind: 'saved';      which: SavedPlaceKind; place: SavedPlace | null }
  | { kind: 'history';    entry: HistoryEntry }
  | { kind: 'more' }
  | { kind: 'suggestion'; result: SearchResult }

/** Accent- and case-insensitive text for matching (NFD + combining marks stripped). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Short title of a history entry (first segment of the geocoded name, else the query). */
export function historyTitle(e: HistoryEntry): string {
  return (e.result_name ?? '').split(',')[0].trim() || e.query
}

function historySubtitle(e: HistoryEntry): string | null {
  if (!e.result_name) return null
  const rest = e.result_name.split(',').slice(1).map(s => s.trim()).filter(Boolean)
  return rest.length ? rest.join(', ') : null
}

/**
 * Splits `name` into [before, match, after] around the first occurrence of
 * `query` (folded comparison). Falls back to no highlight when folding changed
 * the string length (ligatures), so the bold span can never drift.
 */
function highlight(name: string, query: string): ReactNode {
  const fq = fold(query.trim())
  if (!fq) return name
  const fn = fold(name)
  const idx = fn.indexOf(fq)
  if (idx < 0 || fn.length !== name.length) return name
  return (
    <>
      {name.slice(0, idx)}
      <span className="font-semibold">{name.slice(idx, idx + fq.length)}</span>
      {name.slice(idx + fq.length)}
    </>
  )
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function RowShell({
  active, onHover, onClick, icon, children, trailing, className = 'h-14',
}: {
  active: boolean; onHover: () => void; onClick: () => void
  icon: ReactNode; children: ReactNode; trailing?: ReactNode; className?: string
}) {
  return (
    <div
      role="option" aria-selected={active}
      onMouseEnter={e => { onHover(); e.currentTarget.style.backgroundColor = ROW_HOVER }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}
      onMouseDown={e => e.preventDefault()}   // keep the focus in the search input
      onClick={onClick}
      className={`flex items-center gap-3 px-4 cursor-pointer ${className} ${active ? 'bg-surface-1' : 'bg-transparent'}`}
    >
      {icon}
      <div className="flex-1 min-w-0">{children}</div>
      {trailing}
    </div>
  )
}

function Circle({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>{children}</span>
}

function SavedEditor({
  which, place, onSave, onCancel,
}: {
  which: SavedPlaceKind; place: SavedPlace | null
  onSave: (p: SavedPlace | null) => void; onCancel: () => void
}) {
  const { t } = useTranslation('maps')
  const Icon = which === 'home' ? Home : Briefcase
  return (
    <div className="flex items-center gap-3 px-4 py-2" onMouseDown={e => e.stopPropagation()}>
      <Circle className="bg-primary-light text-primary"><Icon size={20} /></Circle>
      <div className="flex-1 min-w-0">
        <MapsAddressInput
          value={null}
          placeholder={t('maps_saved_address_placeholder', { defaultValue: 'Rechercher une adresse' })}
          onSelect={r => onSave({
            label: formatAddress(r.address) ?? r.display_name,
            lat:   parseFloat(r.lat),
            lng:   parseFloat(r.lon),
          })}
        />
      </div>
      {place && (
        <button type="button" onClick={() => onSave(null)}
          title={t('maps_saved_remove', { defaultValue: "Supprimer l'adresse" })}
          {...hoverBg(BUTTON_HOVER)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary flex-shrink-0">
          <Trash2 size={18} />
        </button>
      )}
      <button type="button" onClick={onCancel}
        title={t('common_cancel', { defaultValue: 'Annuler' })}
        {...hoverBg(BUTTON_HOVER)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary flex-shrink-0">
        <X size={18} />
      </button>
    </div>
  )
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

export function MapsSearchDropdown({
  rows, active, query, error, editing, busyRow, onHover, onActivate, onEdit, onSaveSaved, onSave,
}: {
  rows:        SearchRow[]
  active:      number
  query:       string
  error:       string | null
  editing:     SavedPlaceKind | null
  /** Id of the history entry currently being geocoded (spinner on its row). */
  busyRow?:    string | null
  onHover:     (index: number) => void
  onActivate:  (row: SearchRow) => void
  onEdit:      (which: SavedPlaceKind | null) => void
  onSaveSaved: (which: SavedPlaceKind, place: SavedPlace | null) => void
  onSave?:     (r: SearchResult) => void
}) {
  const { t } = useTranslation('maps')
  const savedTitle = (which: SavedPlaceKind) => which === 'home'
    ? t('maps_saved_home', { defaultValue: 'Domicile' })
    : t('maps_saved_work', { defaultValue: 'Travail' })

  return (
    <div
      role="listbox"
      className={`border-t border-border rounded-b-3xl bg-surface-0 py-2 ${editing ? 'overflow-visible' : 'overflow-hidden max-h-[60vh] overflow-y-auto'}`}
    >
      {error && (
        <p className="px-4 py-3 text-sm text-danger flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>
      )}
      {rows.map((row, i) => {
        const isActive = i === active
        const hover = () => onHover(i)
        switch (row.kind) {
          case 'saved': {
            const Icon = row.which === 'home' ? Home : Briefcase
            if (editing === row.which) {
              return (
                <SavedEditor key={row.which} which={row.which} place={row.place}
                  onSave={p => { onSaveSaved(row.which, p); onEdit(null) }}
                  onCancel={() => onEdit(null)} />
              )
            }
            return (
              <RowShell key={row.which} active={isActive} onHover={hover} onClick={() => onActivate(row)}
                icon={<Circle className="bg-primary-light text-primary"><Icon size={20} /></Circle>}
                trailing={
                  <button type="button"
                    onClick={e => { e.stopPropagation(); onEdit(row.which) }}
                    className="text-sm font-medium text-primary flex-shrink-0 px-1">
                    {t('maps_saved_edit', { defaultValue: 'Modifier' })}
                  </button>
                }>
                <p className="text-sm font-medium text-text-primary truncate">{savedTitle(row.which)}</p>
                <p className="text-sm text-text-secondary truncate">
                  {row.place ? savedPlaceSubtitle(row.place) : t('maps_saved_set_address', { defaultValue: "Définir l'adresse" })}
                </p>
              </RowShell>
            )
          }
          case 'history': {
            const subtitle = historySubtitle(row.entry)
            return (
              <RowShell key={`h-${row.entry.id}`} active={isActive} onHover={hover} onClick={() => onActivate(row)}
                icon={<Circle className="bg-surface-2 text-text-primary"><Clock size={20} /></Circle>}
                trailing={busyRow === row.entry.id
                  ? <RefreshCw size={16} className="text-text-tertiary animate-spin flex-shrink-0" /> : undefined}>
                <p className="text-sm text-text-primary truncate">{highlight(historyTitle(row.entry), query)}</p>
                {subtitle && <p className="text-sm text-text-secondary truncate">{subtitle}</p>}
              </RowShell>
            )
          }
          case 'more':
            return (
              <RowShell key="more" active={isActive} onHover={hover} onClick={() => onActivate(row)}
                className="h-12 justify-center" icon={null}>
                <p className="text-center text-sm font-medium text-primary">
                  {t('maps_search_more_recent', { defaultValue: 'Autres adresses récentes' })}
                </p>
              </RowShell>
            )
          case 'suggestion': {
            const r = row.result
            const name   = r.namedetails?.name || r.display_name.split(',')[0].trim()
            const detail = r.display_name.split(',').slice(1).map(s => s.trim()).filter(Boolean).join(', ')
            return (
              <RowShell key={`s-${r.place_id}`} active={isActive} onHover={hover} onClick={() => onActivate(row)}
                className="h-12"
                icon={<span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-2 text-text-secondary"><MapPin size={18} /></span>}
                trailing={onSave && isActive ? (
                  <button type="button" title={t('maps_save_place', { defaultValue: 'Enregistrer' })}
                    onClick={e => { e.stopPropagation(); onSave(r) }}
                    {...hoverBg(BUTTON_HOVER)}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-text-secondary">
                    <Plus size={16} />
                  </button>
                ) : undefined}>
                <p className="text-sm text-text-primary truncate">
                  {highlight(name, query)}
                  {detail && <span className="text-sm text-text-secondary"> {detail}</span>}
                </p>
              </RowShell>
            )
          }
        }
      })}
    </div>
  )
}
