// Addressable sidebar views that have no route of their own (map panels, layers…)
// are encoded in the URL hash: `/maps/#<kind>/<id>`.
//
// Keeping the format in a single place lets the sidebar build REAL links
// (`<a href="/maps/#tab/route">`) while the view reads its state back from
// `useLocation().hash`, so a direct link and the browser Back button both work.

const MODULE_PATH = '/maps'

/** Build the link target for an addressable sidebar view. */
export function hashTo(kind: string, id: string): string {
  return `${MODULE_PATH}/#${encodeURIComponent(kind)}/${encodeURIComponent(id)}`
}

/** Parse a `location.hash` back into its `{ kind, id }` pair (null if it is not one). */
export function fromHash(hash: string): { kind: string; id: string } | null {
  const m = /^#([^/]+)\/([^/]+)$/.exec(hash)
  if (!m) return null
  return { kind: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) }
}
