import { useTranslation } from 'react-i18next'
import {
  ArrowUp, ArrowUpRight, ArrowRight, ArrowUpLeft, ArrowLeft,
  CornerUpRight, CornerUpLeft, RotateCcw, RotateCw, Flag, X, Navigation2, AlertTriangle,
} from 'lucide-react'
import type { NavState } from './navigation'

function icon(key: string, size = 30) {
  switch (key) {
    case 'depart':       return <ArrowUp size={size} />
    case 'arrive':       return <Flag size={size} />
    case 'slight-right': return <ArrowUpRight size={size} />
    case 'right':        return <ArrowRight size={size} />
    case 'sharp-right':  return <CornerUpRight size={size} />
    case 'slight-left':  return <ArrowUpLeft size={size} />
    case 'left':         return <ArrowLeft size={size} />
    case 'sharp-left':   return <CornerUpLeft size={size} />
    case 'uturn':        return <RotateCcw size={size} />
    case 'roundabout':   return <RotateCw size={size} />
    default:             return <ArrowUp size={size} />
  }
}

function fmtDist(m: number) { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m` }
function fmtTime(s: number) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? `${h} h ${m} min` : `${m} min` }

export function MapsNavOverlay({
  state, simulating, onStop,
}: {
  state: NavState
  simulating: boolean
  onStop: () => void
}) {
  const { t } = useTranslation('maps')

  return (
    <>
      {/* Bandeau de manœuvre (haut) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1200] w-[min(440px,calc(100vw-24px))] no-print">
        <div className="flex items-center gap-3 bg-primary text-white rounded-2xl shadow-2xl px-4 py-3">
          <span className="flex-shrink-0">{icon(state.iconKey)}</span>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{fmtDist(state.distToManeuver)}</p>
            <p className="text-sm opacity-95 truncate mt-0.5">{state.instruction || t('maps_nav_continue', { defaultValue: 'Continuez' })}</p>
          </div>
        </div>
        {state.offRoute && (
          <div className="mt-1.5 flex items-center gap-1.5 justify-center text-xs text-amber-700 bg-amber-100 rounded-full px-3 py-1 shadow">
            <AlertTriangle size={13} /> {t('maps_nav_rerouting', { defaultValue: 'Hors itinéraire — recalcul…' })}
          </div>
        )}
        {simulating && (
          <div className="mt-1.5 flex items-center justify-center text-[11px] text-primary bg-surface-0 rounded-full px-3 py-0.5 shadow border border-border w-max mx-auto">
            {t('maps_nav_sim', { defaultValue: 'Simulation' })}
          </div>
        )}
      </div>

      {/* Barre inférieure : restant + ETA + arrêt */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1200] no-print">
        <div className="flex items-center gap-4 bg-surface-0 rounded-2xl shadow-2xl border border-border px-4 py-2.5">
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary leading-none">{fmtTime(state.remainingTime)}</p>
            <p className="text-[10px] text-text-tertiary">{t('maps_nav_eta', { defaultValue: 'Restant' })}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary leading-none">{fmtDist(state.remaining)}</p>
            <p className="text-[10px] text-text-tertiary">{t('maps_nav_dist', { defaultValue: 'Distance' })}</p>
          </div>
          <button onClick={onStop}
            className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-danger/10 text-danger text-sm font-medium hover:bg-danger/20 transition-colors">
            <X size={15} /> {t('maps_nav_stop', { defaultValue: 'Quitter' })}
          </button>
        </div>
      </div>

      {/* Pastille « navigation active » (coin) */}
      <div className="absolute top-3 left-3 z-[1190] flex items-center gap-1.5 bg-primary text-white rounded-full px-2.5 py-1 text-xs font-medium shadow no-print">
        <Navigation2 size={13} /> {t('maps_nav_active', { defaultValue: 'Navigation' })}
      </div>
    </>
  )
}
