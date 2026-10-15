// Map marker DOM factories and the small geo/format helpers they share. Kept
// out of MapsPage so the page component holds behaviour, not element strings.

/** Human distance: metres under 1 km, else one-decimal kilometres. */
export function fmtDist(m: number | null): string {
  if (m === null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

/** Saved-place marker: a blue teardrop carrying the place emoji. */
export function makePlaceEl(emoji: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = `<div style="background:#1a73e8;color:#fff;border-radius:50% 50% 50% 0;
                       transform:rotate(-45deg);width:30px;height:30px;
                       display:flex;align-items:center;justify-content:center;
                       font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.35)">
             <span style="transform:rotate(45deg)">${emoji}</span>
           </div>`
  return el
}

// POI marker (category search): a white pill with the category emoji, visually
// distinct from saved-place teardrops so an explore result reads as transient.
export function makePoiEl(emoji: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.innerHTML = `<div style="background:#fff;border:1.5px solid rgba(0,0,0,.12);
                       border-radius:50%;width:26px;height:26px;
                       display:flex;align-items:center;justify-content:center;
                       font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.3)">
             <span>${emoji}</span>
           </div>`
  return el
}

/** Route waypoint marker: a small blue label chip (A, B, …). */
export function makeWaypointEl(label: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = `<div style="background:#1a73e8;color:#fff;border-radius:4px;
                       padding:2px 6px;font-size:11px;font-weight:600;
                       box-shadow:0 2px 4px rgba(0,0,0,.35);white-space:nowrap">${label}</div>`
  return el
}

// Haversine distance (metres) — used to size the explore radius from the
// viewport and to label how far each POI result is from the map centre.
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const la1 = aLat * Math.PI / 180, la2 = bLat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
