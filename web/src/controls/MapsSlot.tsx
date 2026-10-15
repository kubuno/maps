// MapsSlot — the native element behind the `.kbview` <Slot> project control (src/kbview-controls.json).
// Renders a host extension slot (@kubuno/sdk) by name, so a module view can expose a slot declaratively.
import { Slot } from '@kubuno/sdk'

export function MapsSlot({ name }: { name?: string }) {
  return name ? <Slot name={name} /> : null
}
