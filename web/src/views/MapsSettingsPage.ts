/**
 * Code-behind of `MapsSettingsPage.kbview` (converted from `MapsSettingsPage.tsx`).
 *
 * Per-user Maps preferences (map style, units, transport, start position, theme, traffic) + an About tab.
 * Saved through the core `users.preferences` (cross-device) via `useModulePrefs`.
 */
import { bind, type MouseEventArgs, type ValueChangedEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSaveShortcut } from '@ui'

import { ViewBase } from './MapsSettingsPage.kbview'
import * as __parts from './MapsSettingsPage.parts.tsx'
import { useModulePrefs } from '../services/userPrefs'

type MapsPrefs = {
  mapStyle: string; units: string; transport: string
  showTraffic: boolean; startPos: string; theme: string
}
const DEFAULT_PREFS: MapsPrefs = { mapStyle: 'plan', units: 'km', transport: 'car', showTraffic: false, startPos: 'last', theme: 'system' }

type RadioGroupKey = 'mapStyle' | 'units' | 'transport' | 'startPos' | 'theme'
const GROUPS: { group: RadioGroupKey; tk: string; label: string; tkd: string; desc: string; opts: [string, string, string][] }[] = [
  { group: 'mapStyle', tk: 'maps_pref_style', label: 'Style de carte par défaut', tkd: 'maps_pref_style_desc', desc: "Apparence de la carte à l'ouverture du module.", opts: [['plan', 'maps_pref_style_plan', 'Plan'], ['satellite', 'maps_pref_style_satellite', 'Satellite'], ['terrain', 'maps_pref_style_terrain', 'Relief']] },
  { group: 'units', tk: 'maps_pref_units', label: 'Unités de distance', tkd: 'maps_pref_units_desc', desc: 'Système de mesure pour les distances et itinéraires.', opts: [['km', 'maps_pref_units_km', 'Kilomètres (km)'], ['miles', 'maps_pref_units_miles', 'Miles (mi)']] },
  { group: 'transport', tk: 'maps_pref_transport', label: 'Mode de transport par défaut', tkd: 'maps_pref_transport_desc', desc: "Mode présélectionné lors du calcul d'un itinéraire.", opts: [['car', 'maps_pref_transport_car', 'Voiture'], ['bike', 'maps_pref_transport_bike', 'Vélo'], ['foot', 'maps_pref_transport_foot', 'À pied']] },
  { group: 'startPos', tk: 'maps_pref_start', label: 'Position de départ', tkd: 'maps_pref_start_desc', desc: "Emplacement affiché à l'ouverture de la carte.", opts: [['last', 'maps_pref_start_last', 'Dernière position consultée'], ['default', 'maps_pref_start_default', 'Position par défaut']] },
  { group: 'theme', tk: 'maps_pref_theme', label: 'Thème', tkd: 'maps_pref_theme_desc', desc: "Apparence claire ou sombre de l'interface des cartes.", opts: [['system', 'maps_pref_theme_system', 'Système'], ['light', 'maps_pref_theme_light', 'Clair'], ['dark', 'maps_pref_theme_dark', 'Sombre']] },
]
const TAB = 'px-4 py-3 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap'

export type MapsSettingsPageProps = Record<string, never>

export class MapsSettingsPage extends ViewBase {
  @bind accessor tab: 'preferences' | 'about' = 'preferences'
  @bind accessor prefs: MapsPrefs = DEFAULT_PREFS
  @bind accessor savedFlag = false
  @bind accessor busy = false
  private seeded = false
  tr!: MapsSettingsPageStores['t']
  nav!: MapsSettingsPageStores['navigate']
  saved: MapsPrefs = DEFAULT_PREFS
  private update!: (patch: Partial<MapsPrefs>) => Promise<void>

  useStores() {
    const { t } = useTranslation('maps')
    const navigate = useNavigate()
    return { t, navigate }
  }

  useHooks() {
    const { prefs: saved, update } = useModulePrefs<MapsPrefs>('maps', DEFAULT_PREFS)
    useSaveShortcut(() => { void this.save() }, !this.busy)
    if (!this.seeded) { this.seeded = true; this.prefs = saved }
    this.publish({ saved, update })
    return { saved }
  }

  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t, nav: s.navigate })
    this.useHooks()
  }

  get title_label() { return this.tr('maps_settings_title', { defaultValue: 'Réglages' }) }
  get tab_preferences_label() { return this.tr('maps_tab_preferences', { defaultValue: 'Préférences' }) }
  get tab_about_label() { return this.tr('maps_tab_about', { defaultValue: 'À propos' }) }
  get is_preferences() { return this.tab === 'preferences' }
  get is_about() { return this.tab === 'about' }
  get tab_pref_class() { return `${TAB} ${this.is_preferences ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'}` }
  get tab_about_class() { return `${TAB} ${this.is_about ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'}` }

  get rows_groups() {
    return this.memo('rows_groups', [this.prefs, this.tr], () =>
      GROUPS.map(g => ({
        key: g.group,
        label: this.tr(g.tk, { defaultValue: g.label }),
        description: this.tr(g.tkd, { defaultValue: g.desc }),
        has_description: true,
        options: g.opts.map(([value, tk, dv]) => ({
          key: value, value, label: this.tr(tk, { defaultValue: dv }),
          selected: this.prefs[g.group], group: g.group,
        })),
      })))
  }

  get traffic_label() { return this.tr('maps_pref_traffic', { defaultValue: 'Trafic' }) }
  get TrafficToggle() { return __parts.TrafficToggle }
  get traffic_props() {
    return this.memo('traffic_props', [this.prefs.showTraffic, this.tr], () => ({
      checked: this.prefs.showTraffic,
      label: this.tr('maps_pref_traffic_on', { defaultValue: 'Afficher les conditions de circulation' }),
      onChange: this.memo('toggleTraffic:bound', [], () => () => this.setPref('showTraffic', !this.prefs.showTraffic)),
    }))
  }

  get save_button_label() {
    return this.savedFlag
      ? this.tr('maps_settings_saved', { defaultValue: 'Enregistré' })
      : this.tr('maps_settings_save_changes', { defaultValue: 'Enregistrer les modifications' })
  }
  get save_button_icon() { return this.savedFlag ? 'Check' : '' }
  get cancel_label() { return this.tr('common_cancel', { defaultValue: 'Annuler' }) }
  get about_version() { return `v0.1.0 · ${this.tr('maps_official_module', { defaultValue: 'Module officiel' })}` }

  private setPref<K extends keyof MapsPrefs>(key: K, value: MapsPrefs[K]) {
    this.prefs = { ...this.prefs, [key]: value }
  }

  async save() {
    this.busy = true
    try {
      await this.update(this.prefs)
      this.savedFlag = true
      setTimeout(() => { this.savedFlag = false }, 2500)
    } finally { this.busy = false }
  }

  go_maps(_s: unknown, _a: MouseEventArgs) { this.nav('/maps') }
  tab_preferences(_s: unknown, _a: MouseEventArgs) { this.tab = 'preferences' }
  tab_about(_s: unknown, _a: MouseEventArgs) { this.tab = 'about' }
  radio_changed(_s: unknown, args: ValueChangedEventArgs) {
    const { group, value } = (args as ValueChangedEventArgs & { row: { group: RadioGroupKey; value: string } }).row
    this.setPref(group, value)
  }
  save_click(_s: unknown, _a: MouseEventArgs) { void this.save() }
  cancel(_s: unknown, _a: MouseEventArgs) { this.prefs = this.saved }
  open_repo(_s: unknown, _a: MouseEventArgs) { window.open('https://github.com/kubuno/maps', '_blank', 'noopener') }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsSettingsPageStores = ReturnType<MapsSettingsPage['useStores']>

export default MapsSettingsPage.component()
