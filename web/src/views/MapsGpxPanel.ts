/**
 * Code-behind of `MapsGpxPanel.kbview` (converted from `MapsGpxPanel.tsx`).
 *
 * GPX tab: record a live GPS track or import a .gpx file, and list saved traces.
 */
import { type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsGpxPanel.kbview'
import * as __parts from './MapsGpxPanel.parts.tsx'
import { fmtDist } from '../services/mapMarkers'

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

export interface MapsGpxPanelProps {
  traces:     GpxTrace[]
  onShow:     (id: string, name: string) => void
  onDelete:   (id: string) => void
  onUpload:   (file: File) => void
  recording:  boolean
  recStats:   { points: number; dist: number; elapsed: number } | null
  onStartRec: () => void
  onStopRec:  (save: boolean) => void
}

const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

export class MapsGpxPanel extends ViewBase {
  tr!: MapsGpxPanelStores['t']

  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
  }

  get show_start() {
    return !this.props.recording
  }

  get show_empty() {
    return this.props.traces.length === 0
  }

  get show_list() {
    return this.props.traces.length > 0
  }

  get rec_active_label() {
    return this.tr('maps_rec_active', { defaultValue: 'Enregistrement…' })
  }

  get rec_elapsed() {
    return this.props.recStats ? fmtElapsed(this.props.recStats.elapsed) : '0:00'
  }

  get rec_dist() {
    return fmtDist(this.props.recStats?.dist ?? 0)
  }

  get rec_points() {
    return `${this.props.recStats?.points ?? 0} ${this.tr('maps_rec_points', { defaultValue: 'points' })}`
  }

  get rec_save_label() {
    return this.tr('maps_rec_save', { defaultValue: 'Terminer & enregistrer' })
  }

  get rec_discard_label() {
    return this.tr('maps_rec_discard', { defaultValue: 'Abandonner' })
  }

  get rec_start_label() {
    return this.tr('maps_rec_start', { defaultValue: 'Enregistrer une trace' })
  }

  get empty_label() {
    return this.tr('maps_gpx_empty')
  }

  get GpxImport() {
    return __parts.GpxImport
  }

  get import_props() {
    return this.memo('import_props', [this.tr, this.props.onUpload], () => ({
      label: this.tr('maps_gpx_import'),
      onUpload: this.props.onUpload,
    }))
  }

  get rows_traces() {
    return this.memo('rows_traces', [this.props.traces], () =>
      this.props.traces.map(trace => {
        const meta = `${fmtDist(trace.distance_meters)}${trace.elevation_gain ? ` · +${Math.round(trace.elevation_gain)}m` : ''} · ${trace.activity_type}`
        return { key: trace.id, trace, name: trace.name, meta }
      }),
    )
  }

  start_rec(_sender: unknown, _args: MouseEventArgs) {
    this.props.onStartRec()
  }

  stop_save(_sender: unknown, _args: MouseEventArgs) {
    this.props.onStopRec(true)
  }

  stop_discard(_sender: unknown, _args: MouseEventArgs) {
    this.props.onStopRec(false)
  }

  show(_sender: unknown, args: MouseEventArgs) {
    const { trace } = (args as MouseEventArgs & { row: RowOfTraces }).row
    this.props.onShow(trace.id, trace.name)
  }

  del(_sender: unknown, args: MouseEventArgs) {
    const { trace } = (args as MouseEventArgs & { row: RowOfTraces }).row
    this.props.onDelete(trace.id)
  }
}

type RowOfTraces = MapsGpxPanel['rows_traces'][number]

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsGpxPanelStores = ReturnType<MapsGpxPanel['useStores']>

export default MapsGpxPanel.component()
