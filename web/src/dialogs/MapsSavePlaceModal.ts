/**
 * Code-behind of `MapsSavePlaceModal.kbview` (converted from `MapsSavePlaceModal.tsx`).
 *
 * Modal to name and note a point before saving it to the user's places.
 */
import { bind, type MouseEventArgs } from '@kubuno/views'
import { useTranslation } from 'react-i18next'

import { ViewBase } from './MapsSavePlaceModal.kbview'
import * as __parts from './MapsSavePlaceModal.parts.tsx'

export interface MapsSavePlaceModalProps {
  lat:         number
  lng:         number
  /** Prefilled name — the reverse-geocoded label of the point, usually. */
  defaultName: string
  onSave:      (name: string, note: string) => void
  onClose:     () => void
}

export class MapsSavePlaceModal extends ViewBase {
  @bind accessor name = ''
  @bind accessor note = ''
  /** One-shot guard so the prop-derived initial name seeds only on the first render (like `useState(defaultName)`). */
  private seeded = false
  tr!: MapsSavePlaceModalStores['t']

  /** The screen's hooks that read nothing of the view (stores, translations…), as the TSX called them. */
  useStores() {
    const { t } = useTranslation('maps')
    return { t }
  }

  /** Runs the hooks and publishes what they give as fields (the bindings, the getters and the methods read them). */
  use(): void {
    const s = this.useStores()
    this.publish({ tr: s.t })
    if (!this.seeded) {
      this.seeded = true
      this.name = this.props.defaultName
    }
  }

  get title() {
    return this.tr('maps_save_place')
  }

  get coords() {
    return `${this.props.lat.toFixed(6)}, ${this.props.lng.toFixed(6)}`
  }

  get note_placeholder() {
    return this.tr('maps_note_optional')
  }

  get cancel_label() {
    return this.tr('common_cancel')
  }

  get save_label() {
    return this.tr('common_save')
  }

  get can_save() {
    return this.name.trim().length > 0
  }

  get NameInput() {
    return __parts.NameInput
  }

  get name_input_props() {
    return this.memo('name_input_props', [this.name, this.tr], () => ({
      name:        this.name,
      setName:     this.memo('setName:bound', [], () => this.setName.bind(this)),
      placeholder: this.tr('maps_place_name'),
    }))
  }

  /** `setName` of the TSX: a value, or an update of the previous one. */
  setName(value: string | ((prev: string) => string)) {
    this.name = typeof value === 'function' ? value(this.name) : value
  }

  save_click(_sender: unknown, _args: MouseEventArgs) {
    const name = this.name.trim()
    if (name) this.props.onSave(name, this.note.trim())
  }

  close_click(_sender: unknown, _args: MouseEventArgs) {
    this.props.onClose()
  }
}

/** What `useStores()` gives (the types of the fields it fills). */
export type MapsSavePlaceModalStores = ReturnType<MapsSavePlaceModal['useStores']>

export default MapsSavePlaceModal.component()
