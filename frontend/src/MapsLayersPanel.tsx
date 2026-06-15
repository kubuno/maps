import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { X, Map as MapIcon, Satellite, Bike, Mountain, Check, Tag } from 'lucide-react'
import type { BaseMap } from './mapsLayers'

// Panneau « Détails de la carte » (façon Google Maps), ouvert depuis le bouton
// « Couches ». Sous-ensemble réalisable avec des données libres : type de fond
// (défaut/satellite), calques Vélo & Relief, bascules Vue Globe & Libellés.
export function MapsLayersPanel({
  baseMap, onBaseMap, showLabels, onToggleLabels, globe, onToggleGlobe,
  cycle, onToggleCycle, relief, onToggleRelief, onClose,
}: {
  baseMap:        BaseMap
  onBaseMap:      (b: BaseMap) => void
  showLabels:     boolean
  onToggleLabels: () => void
  globe:          boolean
  onToggleGlobe:  () => void
  cycle:          boolean
  onToggleCycle:  () => void
  relief:         boolean
  onToggleRelief: () => void
  onClose:        () => void
}) {
  const { t } = useTranslation('maps')

  // Vignette cliquable (calque ou type de carte).
  const Tile = ({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 w-[88px] group">
      <span className={`relative w-16 h-16 rounded-xl flex items-center justify-center transition-all
        ${active ? 'ring-2 ring-primary text-primary bg-primary-light' : 'bg-surface-2 text-text-secondary group-hover:bg-surface-3'}`}>
        {icon}
        {active && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"><Check size={11} className="text-white" /></span>}
      </span>
      <span className={`text-[11px] text-center leading-tight ${active ? 'text-primary font-medium' : 'text-text-secondary'}`}>{label}</span>
    </button>
  )

  const Toggle = ({ checked, label, onClick }: { checked: boolean; label: ReactNode; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-2 text-sm text-text-primary">
      <span className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-strong'}`}>
        {checked && <Check size={13} className="text-white" />}
      </span>
      {label}
    </button>
  )

  return (
    <div className="w-[340px] bg-surface-0 rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-base font-semibold text-text-primary">{t('maps_layers_title', { defaultValue: 'Détails de la carte' })}</h3>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><X size={18} /></button>
      </div>

      <div className="p-4 overflow-y-auto">
        {/* Calques */}
        <div className="flex flex-wrap gap-3">
          <Tile active={cycle}  icon={<Bike size={26} />}     label={t('maps_layer_cycle',  { defaultValue: 'Vélo' })}   onClick={onToggleCycle} />
          <Tile active={relief} icon={<Mountain size={26} />} label={t('maps_layer_relief', { defaultValue: 'Relief' })} onClick={onToggleRelief} />
        </div>

        {/* Type de carte */}
        <div className="mt-5">
          <p className="text-sm font-medium text-text-primary mb-3">{t('maps_layers_basemap', { defaultValue: 'Type de carte' })}</p>
          <div className="flex gap-3">
            <Tile active={baseMap === 'default'}   icon={<MapIcon size={26} />}   label={t('maps_base_default',   { defaultValue: 'Par défaut' })} onClick={() => onBaseMap('default')} />
            <Tile active={baseMap === 'satellite'} icon={<Satellite size={26} />} label={t('maps_base_satellite', { defaultValue: 'Satellite' })}  onClick={() => onBaseMap('satellite')} />
          </div>
        </div>

        {/* Bascules */}
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
          <Toggle checked={globe}      label={t('maps_globe_view', { defaultValue: 'Vue Globe' })} onClick={onToggleGlobe} />
          <Toggle checked={showLabels} label={
            <span className="flex items-center gap-1"><Tag size={13} /> {t('maps_labels', { defaultValue: 'Libellés' })}</span>
          } onClick={onToggleLabels} />
        </div>
      </div>
    </div>
  )
}
