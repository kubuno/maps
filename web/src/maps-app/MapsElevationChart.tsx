import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Download, TrendingUp, TrendingDown, Mountain, Ruler, Clock, Gauge } from 'lucide-react'

export interface TrackPoint { lat: number; lng: number; ele: number | null; dist: number; time: string | null }
export interface TrackData {
  points: TrackPoint[]
  distance_meters: number
  elevation_gain: number
  elevation_loss: number
  min_elevation: number | null
  max_elevation: number | null
  duration_secs: number | null
  avg_speed_ms: number | null
  point_count: number
  bbox: [number, number, number, number]
}

function fmtKm(m: number) { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m` }
function fmtDur(s: number) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? `${h} h ${m} min` : `${m} min` }

// Profil d'élévation (graphique en aire SVG) + statistiques détaillées d'une trace.
export function MapsElevationChart({
  name, data, onClose, onExport, onHover,
}: {
  name: string
  data: TrackData
  onClose: () => void
  onExport: () => void
  onHover?: (p: TrackPoint | null) => void
}) {
  const { t } = useTranslation('maps')
  const W = 560, H = 120, PAD = 4

  const { path, area, hasEle, eMin, eMax } = useMemo(() => {
    const pts = data.points.filter(p => p.ele != null) as (TrackPoint & { ele: number })[]
    if (pts.length < 2) return { path: '', area: '', hasEle: false, eMin: 0, eMax: 0 }
    const dMax = data.distance_meters || pts[pts.length - 1].dist || 1
    const eMin = Math.min(...pts.map(p => p.ele))
    const eMax = Math.max(...pts.map(p => p.ele))
    const span = Math.max(1, eMax - eMin)
    const x = (d: number) => PAD + (d / dMax) * (W - 2 * PAD)
    const y = (e: number) => PAD + (1 - (e - eMin) / span) * (H - 2 * PAD)
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.dist).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ')
    const area = `${path} L${x(pts[pts.length - 1].dist).toFixed(1)},${H - PAD} L${x(pts[0].dist).toFixed(1)},${H - PAD} Z`
    return { path, area, hasEle: true, eMin, eMax }
  }, [data])

  const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-text-tertiary">{icon}</span>
      <div className="leading-tight">
        <p className="text-[10px] text-text-tertiary">{label}</p>
        <p className="text-xs font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  )

  return (
    <div className="bg-surface-0 rounded-2xl shadow-2xl border border-border overflow-hidden w-[600px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary truncate">{name}</h3>
        <div className="flex items-center gap-1">
          <button onClick={onExport} title={t('maps_gpx_export_geojson', { defaultValue: 'Exporter en GeoJSON' })}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-1"><Download size={15} /></button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-1"><X size={16} /></button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-2.5">
        <Stat icon={<Ruler size={14} />}        label={t('maps_stat_distance', { defaultValue: 'Distance' })} value={fmtKm(data.distance_meters)} />
        <Stat icon={<TrendingUp size={14} />}   label={t('maps_stat_gain', { defaultValue: 'Dénivelé +' })} value={`${Math.round(data.elevation_gain)} m`} />
        <Stat icon={<TrendingDown size={14} />} label={t('maps_stat_loss', { defaultValue: 'Dénivelé −' })} value={`${Math.round(data.elevation_loss)} m`} />
        {data.min_elevation != null && data.max_elevation != null && (
          <Stat icon={<Mountain size={14} />} label={t('maps_stat_altitude', { defaultValue: 'Altitude' })} value={`${Math.round(data.min_elevation)}–${Math.round(data.max_elevation)} m`} />
        )}
        {data.duration_secs != null && (
          <Stat icon={<Clock size={14} />} label={t('maps_stat_duration', { defaultValue: 'Durée' })} value={fmtDur(data.duration_secs)} />
        )}
        {data.avg_speed_ms != null && (
          <Stat icon={<Gauge size={14} />} label={t('maps_stat_speed', { defaultValue: 'Vitesse moy.' })} value={`${(data.avg_speed_ms * 3.6).toFixed(1)} km/h`} />
        )}
      </div>

      {/* Graphe d'élévation */}
      {hasEle ? (
        <div className="px-2 pb-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]"
            onMouseLeave={() => onHover?.(null)}
            onMouseMove={e => {
              if (!onHover) return
              const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect()
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              const target = frac * (data.distance_meters || 1)
              let best = data.points[0]
              for (const p of data.points) if (Math.abs(p.dist - target) < Math.abs(best.dist - target)) best = p
              onHover(best)
            }}>
            <defs>
              <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a73e8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#1a73e8" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#eleGrad)" />
            <path d={path} fill="none" stroke="#1a73e8" strokeWidth="1.5" />
            <text x={PAD + 2} y={12} className="fill-text-tertiary" style={{ fontSize: 9 }}>{Math.round(eMax)} m</text>
            <text x={PAD + 2} y={H - 6} className="fill-text-tertiary" style={{ fontSize: 9 }}>{Math.round(eMin)} m</text>
          </svg>
        </div>
      ) : (
        <p className="px-4 py-4 text-xs text-text-tertiary">{t('maps_no_elevation', { defaultValue: "Pas de données d'élévation dans cette trace." })}</p>
      )}
    </div>
  )
}
