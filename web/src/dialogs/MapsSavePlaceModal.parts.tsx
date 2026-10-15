/**
 * The part of `MapsSavePlaceModal.kbview` still written in React: the name field keeps `autoFocus`,
 * which has no .kbview property. Rendered by a `<ReactHost>` with the values it reads as props.
 */
import { Input } from '@ui'
import type { MapsSavePlaceModal } from './MapsSavePlaceModal'

export function NameInput({ name, setName, placeholder }: {
  name:        NonNullable<MapsSavePlaceModal['name']>
  setName:     NonNullable<MapsSavePlaceModal['setName']>
  placeholder: string
}) {
  return (
    <Input
      value={name}
      onChange={e => setName(e.target.value)}
      placeholder={placeholder}
      autoFocus
    />
  )
}
