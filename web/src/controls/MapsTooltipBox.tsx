// MapsTooltipBox — the native element behind the `.kbview` <Tooltip> project control
// (src/kbview-controls.json). Wraps the @ui Tooltip so a styled hover tip can be authored declaratively
// instead of the plain `ToolTip` attribute. SingleWidget: its one child element is the hover target
// (the @ui Tooltip clones that single element to attach pointer handlers).
import type { ReactElement } from 'react'
import { Tooltip } from '@ui'

export interface MapsTooltipBoxProps {
  /** The tip text (the `Label` property). */
  label?:    string
  children?: ReactElement
}

export function MapsTooltipBox({ label, children }: MapsTooltipBoxProps) {
  if (!children) return null
  return <Tooltip label={label ?? ''}>{children}</Tooltip>
}
