import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ruler, Shapes, MapPin, Type, Spline, Pentagon, Circle as CircleIcon,
  Trash2, Plus, Save, Share2, Check, X, Undo2, FilePlus,
} from 'lucide-react'
import { SKETCH_COLORS } from './mapSketch'
import type { Tool, useSketch } from './useSketch'

type SketchApi = ReturnType<typeof useSketch>

const TOOLS: { id: Tool; tk: string; fallback: string; icon: typeof Ruler }[] = [
  { id: 'measure-line', tk: 'maps_tool_measure_dist', fallback: 'Distance', icon: Ruler },
  { id: 'measure-area', tk: 'maps_tool_measure_area', fallback: 'Surface',  icon: Shapes },
  { id: 'pin',          tk: 'maps_tool_pin',          fallback: 'Épingle',  icon: MapPin },
  { id: 'text',         tk: 'maps_tool_text',         fallback: 'Texte',    icon: Type },
  { id: 'line',         tk: 'maps_tool_line',         fallback: 'Ligne',    icon: Spline },
  { id: 'polygon',      tk: 'maps_tool_polygon',      fallback: 'Polygone', icon: Pentagon },
  { id: 'circle',       tk: 'maps_tool_circle',       fallback: 'Cercle',   icon: CircleIcon },
]

const KIND_ICON: Record<string, typeof Ruler> = {
  'pin': MapPin, 'text': Type, 'line': Spline, 'polygon': Pentagon, 'circle': CircleIcon,
  'measure-line': Ruler, 'measure-area': Shapes,
}

/**
 * `allowSharing` reflects the instance policy: when an administrator forbids new
 * public links, the control is hidden rather than left to fail server-side.
 * Defaults to `true` so the panel behaves unchanged wherever the flag is absent.
 */
export function MapsSketchPanel({ s, allowSharing = true }: { s: SketchApi; allowSharing?: boolean }) {
  const { t } = useTranslation('maps')
  const multiActive = ['line', 'polygon', 'measure-line', 'measure-area'].includes(s.tool)

  useEffect(() => { s.loadSketches() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      {/* Barre d'outils */}
      <div className="grid grid-cols-4 gap-1.5">
        {TOOLS.map(({ id, tk, fallback, icon: Icon }) => {
          const active = s.tool === id
          return (
            <button key={id} title={t(tk, { defaultValue: fallback })}
              onClick={() => s.setTool(active ? 'none' : id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-medium transition-colors ${
                active ? 'bg-primary text-white border-primary' : 'bg-surface-0 text-text-secondary border-border hover:bg-surface-1'
              }`}>
              <Icon size={16} />
              <span className="truncate max-w-full">{t(tk, { defaultValue: fallback })}</span>
            </button>
          )
        })}
      </div>

      {/* Palette de couleurs */}
      <div className="flex items-center gap-1.5">
        {SKETCH_COLORS.map(c => (
          <button key={c} onClick={() => s.setColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${s.color === c ? 'scale-110 border-text-primary' : 'border-white'}`}
            style={{ background: c }} aria-label={c} />
        ))}
      </div>

      {/* Aide / actions de tracé en cours */}
      {s.tool !== 'none' && (
        <div className="px-3 py-2 rounded-lg bg-surface-1 text-[11px] text-text-secondary">
          {s.tool === 'circle'
            ? t('maps_sketch_hint_circle', { defaultValue: 'Cliquez le centre, puis le bord.' })
            : multiActive
              ? t('maps_sketch_hint_multi', { defaultValue: 'Cliquez pour ajouter des points, double-cliquez pour terminer.' })
              : t('maps_sketch_hint_point', { defaultValue: 'Cliquez sur la carte pour placer.' })}
          {multiActive && s.draftCount > 0 && (
            <div className="flex gap-2 mt-2">
              <button onClick={s.finishDraft}
                className="flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary-hover">
                <Check size={12} /> {t('maps_sketch_finish', { defaultValue: 'Terminer' })} ({s.draftCount})
              </button>
              <button onClick={() => s.setTool(s.tool)}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border text-text-secondary text-[11px] hover:bg-surface-2">
                <X size={12} /> {t('common_cancel', { defaultValue: 'Annuler' })}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Liste des éléments dessinés */}
      {s.features.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          {s.features.map(f => {
            const Icon = KIND_ICON[f.kind] ?? MapPin
            const editable = f.kind === 'pin' || f.kind === 'text'
            return (
              <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-1 group">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.color }} />
                <Icon size={13} className="text-text-tertiary flex-shrink-0" />
                {editable ? (
                  <input
                    value={f.label ?? ''}
                    onChange={e => s.updateFeature(f.id, { label: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-xs text-text-primary focus:outline-none border-b border-transparent focus:border-border"
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-xs text-text-secondary truncate">{f.label || t(`maps_kind_${f.kind.replace('-', '_')}`, { defaultValue: f.kind })}</span>
                )}
                <button onClick={() => s.removeFeature(f.id)}
                  className="text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><Trash2 size={13} /></button>
              </div>
            )
          })}
          <div className="flex gap-3 px-1 pt-1">
            <button onClick={s.undo} className="text-[11px] text-text-tertiary hover:text-primary flex items-center gap-1"><Undo2 size={11} /> {t('common_undo', { defaultValue: 'Annuler' })}</button>
            <button onClick={s.clearAll} className="text-[11px] text-text-tertiary hover:text-danger flex items-center gap-1"><Trash2 size={11} /> {t('maps_sketch_clear', { defaultValue: 'Tout effacer' })}</button>
          </div>
        </div>
      )}

      {/* Sauvegarde / partage */}
      <div className="border-t border-border pt-3 flex flex-col gap-2">
        <input
          value={s.name}
          onChange={e => s.setName(e.target.value)}
          placeholder={t('maps_sketch_name', { defaultValue: 'Nom du croquis' })}
          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface-0 text-sm focus:outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button onClick={s.saveSketch} disabled={s.busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-50">
            <Save size={13} /> {t('common_save', { defaultValue: 'Enregistrer' })}
          </button>
          <button onClick={s.newSketch} title={t('maps_sketch_new', { defaultValue: 'Nouveau' })}
            className="flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-1"><FilePlus size={14} /></button>
          {allowSharing && (
            <button onClick={() => s.shareSketch()} disabled={s.busy} title={t('maps_sketch_share', { defaultValue: 'Partager' })}
              className="flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-1 disabled:opacity-50"><Share2 size={14} /></button>
          )}
        </div>
        {s.shareUrl && (
          <p className="text-[10px] text-text-tertiary break-all bg-surface-1 rounded px-2 py-1">
            {t('maps_sketch_shared', { defaultValue: 'Lien copié :' })} {s.shareUrl}
          </p>
        )}
      </div>

      {/* Croquis enregistrés */}
      {s.sketches.length > 0 && (
        <div className="border-t border-border pt-2 flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary px-1 mb-0.5">{t('maps_sketch_saved', { defaultValue: 'Mes croquis' })}</p>
          {s.sketches.map(sk => (
            <div key={sk.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-1 group ${sk.id === s.currentId ? 'bg-primary-light' : ''}`}>
              <button onClick={() => s.openSketch(sk.id)} className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-text-primary truncate">{sk.name}</p>
                <p className="text-[10px] text-text-tertiary">{sk.feature_count} · {sk.is_public ? t('maps_sketch_public', { defaultValue: 'public' }) : t('maps_sketch_private', { defaultValue: 'privé' })}</p>
              </button>
              <button onClick={() => s.deleteSketch(sk.id)}
                className="text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => s.setTool('none')}
        className="self-start flex items-center gap-1 text-[11px] text-text-tertiary hover:text-primary">
        <Plus size={11} className="rotate-45" /> {t('maps_sketch_stop_tool', { defaultValue: 'Désactiver l\'outil' })}
      </button>
    </div>
  )
}
