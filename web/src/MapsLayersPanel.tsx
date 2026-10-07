import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import {
  X, Map as MapIcon, Satellite, Bike, Mountain, Check, Tag,
  Bus, CloudRain, Box, Sun, Upload, Trash2, FileJson,
  WifiOff, Download, HardDrive, Contrast,
} from 'lucide-react'
import type { BaseMap } from './mapsLayers'

// Panneau « Détails de la carte » (façon Google Maps), ouvert depuis le bouton
// « Couches ». Données libres uniquement : type de fond (défaut/clair/topo/
// satellite), superpositions Vélo/Transports/Pluie/Relief, relief 3D, calques
// importés (GeoJSON/KML), bascules Vue Globe & Libellés.
export function MapsLayersPanel({
  baseMap, onBaseMap, showLabels, onToggleLabels, globe, onToggleGlobe,
  cycle, onToggleCycle, relief, onToggleRelief,
  transit, onToggleTransit, precip, onTogglePrecip, terrain3d, onToggleTerrain3d,
  imports, onImport, onRemoveImport,
  online, cachedTiles, dlProgress, onDownloadArea, onClearTiles,
  highContrast, onToggleContrast, onClose,
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
  transit:        boolean
  onToggleTransit: () => void
  precip:         boolean
  onTogglePrecip: () => void
  terrain3d:      boolean
  onToggleTerrain3d: () => void
  imports:        { id: string; name: string }[]
  onImport:       (file: File) => void
  onRemoveImport: (id: string) => void
  online:         boolean
  cachedTiles:    number
  dlProgress:     { done: number; total: number } | null
  onDownloadArea: () => void
  onClearTiles:   () => void
  highContrast:   boolean
  onToggleContrast: () => void
  onClose:        () => void
}) {
  const { t } = useTranslation('maps')
  const fileRef = useRef<HTMLInputElement>(null)

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
        {/* Superpositions */}
        <p className="text-sm font-medium text-text-primary mb-3">{t('maps_layers_overlays', { defaultValue: 'Superpositions' })}</p>
        <div className="flex flex-wrap gap-3">
          <Tile active={cycle}   icon={<Bike size={26} />}      label={t('maps_layer_cycle',   { defaultValue: 'Vélo' })}        onClick={onToggleCycle} />
          <Tile active={transit} icon={<Bus size={26} />}       label={t('maps_layer_transit', { defaultValue: 'Transports' })}  onClick={onToggleTransit} />
          <Tile active={precip}  icon={<CloudRain size={26} />} label={t('maps_layer_precip',  { defaultValue: 'Pluie' })}       onClick={onTogglePrecip} />
          <Tile active={relief}  icon={<Mountain size={26} />}  label={t('maps_layer_relief',  { defaultValue: 'Relief' })}      onClick={onToggleRelief} />
        </div>

        {/* Type de carte */}
        <div className="mt-5">
          <p className="text-sm font-medium text-text-primary mb-3">{t('maps_layers_basemap', { defaultValue: 'Type de carte' })}</p>
          <div className="flex flex-wrap gap-3">
            <Tile active={baseMap === 'default'}   icon={<MapIcon size={26} />}   label={t('maps_base_default',   { defaultValue: 'Par défaut' })} onClick={() => onBaseMap('default')} />
            <Tile active={baseMap === 'light'}     icon={<Sun size={26} />}       label={t('maps_base_light',     { defaultValue: 'Clair' })}      onClick={() => onBaseMap('light')} />
            <Tile active={baseMap === 'terrain'}   icon={<Mountain size={26} />}  label={t('maps_base_terrain',   { defaultValue: 'Topographique' })} onClick={() => onBaseMap('terrain')} />
            <Tile active={baseMap === 'satellite'} icon={<Satellite size={26} />} label={t('maps_base_satellite', { defaultValue: 'Satellite' })}  onClick={() => onBaseMap('satellite')} />
            <Tile active={baseMap === 'offline'}   icon={<WifiOff size={26} />}   label={t('maps_base_offline',   { defaultValue: 'Hors-ligne' })}  onClick={() => onBaseMap('offline')} />
          </div>
        </div>

        {/* Hors-ligne : téléchargement des tuiles de la zone visible */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
              <HardDrive size={14} /> {t('maps_offline_title', { defaultValue: 'Cartes hors-ligne' })}
            </p>
            {!online && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
                <WifiOff size={11} /> {t('maps_offline_status', { defaultValue: 'Hors-ligne' })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary mb-2">
            {t('maps_offline_count', { count: cachedTiles, defaultValue: `${cachedTiles} tuiles en cache` })}
          </p>
          {dlProgress ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((dlProgress.done / Math.max(1, dlProgress.total)) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-text-tertiary">{dlProgress.done}/{dlProgress.total}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={onDownloadArea}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-2 text-text-secondary text-xs hover:bg-surface-3 transition-colors">
                <Download size={13} /> {t('maps_offline_download', { defaultValue: 'Télécharger cette zone' })}
              </button>
              {cachedTiles > 0 && (
                <button onClick={onClearTiles} title={t('maps_offline_clear', { defaultValue: 'Vider le cache' })}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-text-tertiary hover:text-danger hover:bg-surface-1"><Trash2 size={14} /></button>
              )}
            </div>
          )}
        </div>

        {/* Calques importés (GeoJSON / KML) */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-text-primary">{t('maps_layers_import', { defaultValue: 'Calques importés' })}</p>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary text-xs hover:bg-surface-3 transition-colors">
              <Upload size={13} /> {t('maps_import_file', { defaultValue: 'Importer' })}
            </button>
            <input ref={fileRef} type="file" accept=".geojson,.json,.kml,application/geo+json,application/json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          </div>
          {imports.length === 0
            ? <p className="text-[11px] text-text-tertiary">{t('maps_import_hint', { defaultValue: 'GeoJSON ou KML à superposer sur la carte.' })}</p>
            : (
              <div className="flex flex-col gap-1">
                {imports.map(im => (
                  <div key={im.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-1 group">
                    <FileJson size={13} className="text-text-tertiary flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-xs text-text-secondary truncate">{im.name}</span>
                    <button onClick={() => onRemoveImport(im.id)}
                      className="text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Bascules */}
        <div className="mt-5 pt-4 border-t border-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Toggle checked={globe}      label={t('maps_globe_view', { defaultValue: 'Vue Globe' })} onClick={onToggleGlobe} />
            <Toggle checked={showLabels} label={
              <span className="flex items-center gap-1"><Tag size={13} /> {t('maps_labels', { defaultValue: 'Libellés' })}</span>
            } onClick={onToggleLabels} />
          </div>
          <Toggle checked={terrain3d} label={
            <span className="flex items-center gap-1"><Box size={13} /> {t('maps_terrain_3d', { defaultValue: 'Relief 3D' })}</span>
          } onClick={onToggleTerrain3d} />
          <Toggle checked={highContrast} label={
            <span className="flex items-center gap-1"><Contrast size={13} /> {t('maps_high_contrast', { defaultValue: 'Contraste élevé' })}</span>
          } onClick={onToggleContrast} />
        </div>
      </div>
    </div>
  )
}
