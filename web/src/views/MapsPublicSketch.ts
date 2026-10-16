/**
 * Code-behind of `MapsPublicSketch.kbview` (converted from `MapsPublicSketch.tsx`).
 *
 * Public, read-only view of a shared sketch - an out-of-shell route (`maps/s/:token`) reachable by an
 * anonymous visitor. The map + sketch loading live in the `SketchMap` React part; this holds the title and
 * the load status.
 */
import { bind } from '@kubuno/views'
import { useParams } from 'react-router-dom'

import { ViewBase } from './MapsPublicSketch.kbview'
import * as __parts from './MapsPublicSketch.parts.tsx'

export type MapsPublicSketchProps = Record<string, never>

export class MapsPublicSketch extends ViewBase {
  @bind accessor name = ''
  @bind accessor status: 'loading' | 'ready' | 'error' = 'loading'
  token = ''

  useHooks() {
    const { token = '' } = useParams()
    this.publish({ token })
    return { token }
  }

  use(): void {
    this.useHooks()
  }

  get title() { return this.name || 'Croquis partagé' }
  get show_loading() { return this.status === 'loading' }
  get show_error() { return this.status === 'error' }

  get SketchMap() { return __parts.SketchMap }
  get map_props() {
    return this.memo('map_props', [this.token], () => ({
      token: this.token,
      onName: this.memo('onName:bound', [], () => (n: string) => { this.name = n }),
      onStatus: this.memo('onStatus:bound', [], () => (s: 'loading' | 'ready' | 'error') => { this.status = s }),
    }))
  }
}

export default MapsPublicSketch.component()
