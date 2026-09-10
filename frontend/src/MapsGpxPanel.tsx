import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Trash2, X, Activity, Circle, Check } from 'lucide-react'
import { fmtDist } from './mapMarkers'

export interface GpxTrace {
  id:              string
  name:            string
  distance_meters: number | null
  elevation_gain:  number | null
  activity_type:   string
  point_count:     number
  recorded_at:     string | null
  created_at:      string
}

// GPX tab: record a live GPS track or import a .gpx file, and list saved traces.
export function GpxPanel({
  traces, onShow, onDelete, onUpload, recording, recStats, onStartRec, onStopRec,
}: {
  traces:   GpxTrace[]
  onShow:   (id: string, name: string) => void
  onDelete: (id: string) => void
  onUpload: (file: File) => void
  recording: boolean
  recStats:  { points: number; dist: number; elapsed: number } | null
  onStartRec: () => void
  onStopRec:  (save: boolean) => void
}) {
  const { t } = useTranslation('maps')
  const inputRef = useRef<HTMLInputElement>(null)
  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-2">
      {/* Enregistrement d'une trace GPS */}
      {recording ? (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-danger/5 border border-danger/30">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" /> {t('maps_rec_active', { defaultValue: 'Enregistrement…' })}
            </span>
            <span className="text-xs font-mono text-text-secondary">{recStats ? fmtElapsed(recStats.elapsed) : '0:00'}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-text-secondary">
            <span>{fmtDist(recStats?.dist ?? 0)}</span>
            <span>{recStats?.points ?? 0} {t('maps_rec_points', { defaultValue: 'points' })}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onStopRec(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover">
              <Check size={13} /> {t('maps_rec_save', { defaultValue: 'Terminer & enregistrer' })}
            </button>
            <button onClick={() => onStopRec(false)} title={t('maps_rec_discard', { defaultValue: 'Abandonner' })}
              className="px-2.5 py-1.5 rounded-lg border border-border text-text-tertiary hover:text-danger hover:bg-surface-1"><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button onClick={onStartRec}
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors">
          <Circle size={11} fill="currentColor" /> {t('maps_rec_start', { defaultValue: 'Enregistrer une trace' })}
        </button>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-text-tertiary hover:text-primary text-xs transition-colors"
      >
        <Upload size={13} /> {t('maps_gpx_import')}
      </button>
      <input ref={inputRef} type="file" accept=".gpx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = '' } }} />

      {traces.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2 text-text-tertiary">
          <Activity size={24} className="opacity-30" />
          <p className="text-xs text-center">{t('maps_gpx_empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {traces.map(t => (
            <div key={t.id} className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-surface-1">
              <Activity size={14} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onShow(t.id, t.name)}>
                <p className="text-xs font-medium text-text-primary truncate">{t.name}</p>
                <p className="text-[10px] text-text-tertiary">
                  {fmtDist(t.distance_meters)}
                  {t.elevation_gain ? ` · +${Math.round(t.elevation_gain)}m` : ''}
                  {' · '}{t.activity_type}
                </p>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger text-text-tertiary transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
