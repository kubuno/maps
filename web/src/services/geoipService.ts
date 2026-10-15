// GeoIP service exposed by maps to OTHER modules via ModuleServiceRegistry.
// Maps owns the database; consumers (e.g. p2pnas) call this instead of shipping
// their own. `available:false` means no .mmdb is configured on the maps backend.
import { api } from '@kubuno/sdk'

export interface GeoipResult {
  available: boolean
  country: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
}

export async function geoipLookup(ip: string): Promise<GeoipResult> {
  try {
    const { data } = await api.get<GeoipResult>('/maps/geoip', { params: { ip } })
    return data
  } catch {
    return { available: false, country: null }
  }
}
