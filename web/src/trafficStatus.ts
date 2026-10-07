// Traffic status for the area around the map centre — EXTENSION POINT.
//
// Kubuno has no live traffic data source (no probe fleet, no third-party feed),
// so this hook currently returns `null` and the search overlay's "traffic" row
// stays hidden: we never fake data. When a provider becomes available (an
// instance-configured feed proxied by the maps backend, for instance), implement
// this hook against it — the UI (`MapsLocalCard`) already knows how to render a
// status and only needs a non-null value.

export type TrafficLevel = 'fluid' | 'slow' | 'congested'

export interface TrafficStatus {
  level:        TrafficLevel
  /** Optional typical delay, in minutes, for the area (shown as the subtitle). */
  delayMinutes: number | null
}

export interface LatLng { lat: number; lng: number }

/**
 * Returns the traffic status around `center`, or `null` when unknown.
 * `_center` is unused for now; it is part of the signature so a future
 * implementation can fetch per-area data without touching the callers.
 */
export function useTrafficStatus(_center: LatLng | null): TrafficStatus | null {
  return null
}
