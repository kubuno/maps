import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, ArrowLeft, ExternalLink, Check } from 'lucide-react'
import { Toggle, Button, Radio, useSaveShortcut} from '@ui'
import { useModulePrefs } from './userPrefs'

// ── Per-user preferences (backend, cross-device via core users.preferences) ─────

// `type`, not `interface`: only a type alias gets the implicit index signature
// that `useModulePrefs<T extends Record<string, unknown>>` requires.
type MapsPrefs = {
  mapStyle:    string   // 'plan' | 'satellite' | 'terrain'
  units:       string   // 'km' | 'miles'
  transport:   string   // 'car' | 'bike' | 'foot'
  showTraffic: boolean
  startPos:    string   // 'last' | 'default'
  theme:       string   // 'system' | 'light' | 'dark'
}

const DEFAULT_PREFS: MapsPrefs = {
  mapStyle: 'plan', units: 'km', transport: 'car',
  showTraffic: false, startPos: 'last', theme: 'system',
}

// ── Mail-style layout helpers ───────────────────────────────────────────────────

function SettingsRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-8 py-4 border-b border-[#e8eaed] last:border-0">
      <div className="w-60 flex-shrink-0">
        <p className="text-sm text-[#202124] font-normal">{label}</p>
        {description && <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function RadioGroup({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {options.map(opt => (
        <Radio key={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} label={opt.label} />
      ))}
    </div>
  )
}

// ── Préférences tab (per-user) ──────────────────────────────────────────────────

function PreferencesTab() {
  const { t } = useTranslation('maps')
  const { prefs: saved, update } = useModulePrefs<MapsPrefs>('maps', DEFAULT_PREFS)
  const [prefs, setPrefs] = useState<MapsPrefs>(saved)
  const [savedFlag, setSavedFlag] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof MapsPrefs>(key: K, value: MapsPrefs[K]) =>
    setPrefs(p => ({ ...p, [key]: value }))

  // Ctrl+S saves immediately (disabled while a save is in flight).
  useSaveShortcut(() => { void save() }, !busy)

  const save = async () => {
    setBusy(true)
    try {
      await update(prefs)
      setSavedFlag(true)
      setTimeout(() => setSavedFlag(false), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <SettingsRow
        label={t('maps_pref_style', { defaultValue: 'Style de carte par défaut' })}
        description={t('maps_pref_style_desc', { defaultValue: 'Apparence de la carte à l\'ouverture du module.' })}
      >
        <RadioGroup
          value={prefs.mapStyle}
          onChange={v => set('mapStyle', v)}
          options={[
            { value: 'plan',      label: t('maps_pref_style_plan',      { defaultValue: 'Plan' }) },
            { value: 'satellite', label: t('maps_pref_style_satellite', { defaultValue: 'Satellite' }) },
            { value: 'terrain',   label: t('maps_pref_style_terrain',   { defaultValue: 'Relief' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('maps_pref_units', { defaultValue: 'Unités de distance' })}
        description={t('maps_pref_units_desc', { defaultValue: 'Système de mesure pour les distances et itinéraires.' })}
      >
        <RadioGroup
          value={prefs.units}
          onChange={v => set('units', v)}
          options={[
            { value: 'km',    label: t('maps_pref_units_km',    { defaultValue: 'Kilomètres (km)' }) },
            { value: 'miles', label: t('maps_pref_units_miles', { defaultValue: 'Miles (mi)' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('maps_pref_transport', { defaultValue: 'Mode de transport par défaut' })}
        description={t('maps_pref_transport_desc', { defaultValue: 'Mode présélectionné lors du calcul d\'un itinéraire.' })}
      >
        <RadioGroup
          value={prefs.transport}
          onChange={v => set('transport', v)}
          options={[
            { value: 'car',  label: t('maps_pref_transport_car',  { defaultValue: 'Voiture' }) },
            { value: 'bike', label: t('maps_pref_transport_bike', { defaultValue: 'Vélo' }) },
            { value: 'foot', label: t('maps_pref_transport_foot', { defaultValue: 'À pied' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('maps_pref_start', { defaultValue: 'Position de départ' })}
        description={t('maps_pref_start_desc', { defaultValue: 'Emplacement affiché à l\'ouverture de la carte.' })}
      >
        <RadioGroup
          value={prefs.startPos}
          onChange={v => set('startPos', v)}
          options={[
            { value: 'last',    label: t('maps_pref_start_last',    { defaultValue: 'Dernière position consultée' }) },
            { value: 'default', label: t('maps_pref_start_default', { defaultValue: 'Position par défaut' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('maps_pref_theme', { defaultValue: 'Thème' })}
        description={t('maps_pref_theme_desc', { defaultValue: 'Apparence claire ou sombre de l\'interface des cartes.' })}
      >
        <RadioGroup
          value={prefs.theme}
          onChange={v => set('theme', v)}
          options={[
            { value: 'system', label: t('maps_pref_theme_system', { defaultValue: 'Système' }) },
            { value: 'light',  label: t('maps_pref_theme_light',  { defaultValue: 'Clair' }) },
            { value: 'dark',   label: t('maps_pref_theme_dark',   { defaultValue: 'Sombre' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow label={t('maps_pref_traffic', { defaultValue: 'Trafic' })}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.showTraffic} onChange={() => set('showTraffic', !prefs.showTraffic)} />
          <span className="text-sm text-text-primary">{t('maps_pref_traffic_on', { defaultValue: 'Afficher les conditions de circulation' })}</span>
        </label>
      </SettingsRow>

      <div className="pt-5 flex items-center gap-3">
        <Button onClick={save} loading={busy}>
          {savedFlag
            ? <><Check size={14} className="mr-1.5 inline" />{t('maps_settings_saved', { defaultValue: 'Enregistré' })}</>
            : t('maps_settings_save_changes', { defaultValue: 'Enregistrer les modifications' })}
        </Button>
        <Button variant="ghost" onClick={() => setPrefs(saved)}>
          {t('common_cancel', { defaultValue: 'Annuler' })}
        </Button>
      </div>
    </div>
  )
}

// ── À propos tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  const { t } = useTranslation('maps')
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <MapPin size={20} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Kubuno Maps</p>
          <p className="text-xs text-text-tertiary">v0.1.0 · {t('maps_official_module', { defaultValue: 'Module officiel' })}</p>
        </div>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Rust</span>
      </div>
      <div className="px-5 py-4">
        <a href="https://github.com/kubuno/maps" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink size={13} /> github.com/kubuno/maps
        </a>
      </div>
    </div>
  )
}

// ── Main page (mail-style breadcrumb + tab bar) ─────────────────────────────────

type Tab = 'preferences' | 'about'

export default function MapsSettingsPage() {
  const { t } = useTranslation('maps')
  const [tab, setTab] = useState<Tab>('preferences')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'preferences', label: t('maps_tab_preferences', { defaultValue: 'Préférences' }) },
    { id: 'about',       label: t('maps_tab_about', { defaultValue: 'À propos' }) },
  ]

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[#e8eaed] flex-shrink-0" style={{ background: '#f8f9fa' }}>
        <Link to="/maps" className="flex items-center gap-1.5 text-sm text-[#1a73e8] hover:underline">
          <ArrowLeft size={14} />
          Maps
        </Link>
        <span className="text-text-tertiary text-sm">/</span>
        <div className="flex items-center gap-1.5">
          <MapPin size={15} className="text-text-secondary" />
          <span className="text-sm text-text-primary">{t('maps_settings_title', { defaultValue: 'Réglages' })}</span>
        </div>
      </div>

      {/* Tab bar (Gmail-style) */}
      <div className="flex items-end border-b border-[#e8eaed] px-4 flex-shrink-0 overflow-x-auto" style={{ background: '#fff' }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-3 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === tb.id ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'about'       && <AboutTab />}
        </div>
      </div>
    </div>
  )
}
