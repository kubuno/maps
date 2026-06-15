// Nominatim (OpenStreetMap) geocoding utilities — called directly from the browser,
// no backend proxy needed. All endpoints are free and require no API key.

export interface SearchResult {
  place_id:     string
  display_name: string
  lat:          string
  lon:          string
  osm_type:     string | null
  osm_id:       number | null
  category:     string | null
  type:         string | null
  address:      Record<string, string> | null
  // Tags OSM bruts (horaires, téléphone, site web, accessibilité…) — pour le
  // panneau d'informations détaillées du lieu.
  extratags:    Record<string, string> | null
  namedetails:  Record<string, string> | null
}

/** Maps a raw Nominatim JSON item to our SearchResult shape. */
export function mapNominatimResult(r: Record<string, unknown>): SearchResult {
  return {
    place_id:     String(r.place_id ?? ''),
    display_name: String(r.display_name ?? ''),
    lat:          String(r.lat ?? '0'),
    lon:          String(r.lon ?? '0'),
    osm_type:     (r.osm_type as string)              ?? null,
    osm_id:       (r.osm_id  as number)               ?? null,
    // Nominatim uses "class" for the category concept
    category:     (r.class   as string)               ?? null,
    type:         (r.type    as string)                ?? null,
    address:      (r.address as Record<string, string>) ?? null,
    extratags:    (r.extratags   as Record<string, string>) ?? null,
    namedetails:  (r.namedetails as Record<string, string>) ?? null,
  }
}

/** Builds the Nominatim forward-geocoding URL. */
export function buildNominatimSearchUrl(query: string, limit = 8): string {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q',              query)
  url.searchParams.set('format',         'json')
  url.searchParams.set('limit',          String(limit))
  url.searchParams.set('addressdetails', '1')
  // extratags/namedetails → horaires, téléphone, site web, accessibilité, wikidata…
  url.searchParams.set('extratags',      '1')
  url.searchParams.set('namedetails',    '1')
  url.searchParams.set('accept-language','fr')
  return url.toString()
}

/** Builds the Nominatim reverse-geocoding URL. */
export function buildNominatimReverseUrl(lat: number, lng: number): string {
  return `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    + `&addressdetails=1&extratags=1&namedetails=1&accept-language=fr`
}

// ── Détails structurés d'un lieu (extraits des tags OSM) ────────────────────────

export interface PlaceInfo {
  title:        string                 // nom court du lieu
  categoryLabel:string                 // catégorie lisible (ex. « Gare », « Restaurant »)
  addressLine:  string | null          // adresse formatée sur une ligne
  openingHours: string | null
  phone:        string | null
  website:      string | null
  email:        string | null
  wheelchair:   string | null          // 'yes' | 'limited' | 'no'
  cuisine:      string | null
  stars:        string | null          // hôtels
  operator:     string | null
  wikipedia:    string | null          // URL Wikipédia si dispo
  brand:        string | null
}

// Libellés FR lisibles pour quelques types OSM courants (sinon on retombe sur le type brut).
const TYPE_LABELS: Record<string, string> = {
  station: 'Gare', halt: 'Arrêt', bus_stop: 'Arrêt de bus', subway_entrance: 'Entrée de métro',
  restaurant: 'Restaurant', fast_food: 'Restauration rapide', cafe: 'Café', bar: 'Bar', pub: 'Pub',
  hotel: 'Hôtel', guest_house: "Maison d'hôtes", hostel: 'Auberge', museum: 'Musée',
  supermarket: 'Supermarché', bakery: 'Boulangerie', pharmacy: 'Pharmacie', hospital: 'Hôpital',
  school: 'École', university: 'Université', bank: 'Banque', atm: 'Distributeur', parking: 'Parking',
  fuel: 'Station-service', park: 'Parc', cinema: 'Cinéma', theatre: 'Théâtre', library: 'Bibliothèque',
  attraction: 'Attraction', viewpoint: 'Point de vue', place_of_worship: 'Lieu de culte',
  city: 'Ville', town: 'Commune', village: 'Village', suburb: 'Quartier', neighbourhood: 'Quartier',
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Construit une adresse compacte à partir des champs d'adresse Nominatim. */
export function formatAddress(a: Record<string, string> | null): string | null {
  if (!a) return null
  const house = [a.house_number, a.road].filter(Boolean).join(' ')
  const city  = a.city || a.town || a.village || a.municipality || a.county || ''
  const parts = [house, a.postcode ? `${a.postcode} ${city}`.trim() : city, a.country]
    .map(p => (p || '').trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Extrait les informations détaillées d'un résultat de recherche (tags OSM). */
export function placeDetails(r: SearchResult): PlaceInfo {
  const x = r.extratags ?? {}
  const wikiTag = x.wikipedia // ex. "fr:Gare de ..."
  let wikipedia: string | null = null
  if (wikiTag && wikiTag.includes(':')) {
    const [lang, ...rest] = wikiTag.split(':')
    wikipedia = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(rest.join(':').replace(/ /g, '_'))}`
  }
  return {
    title:         r.namedetails?.name || r.display_name.split(',')[0].trim(),
    categoryLabel: (r.type && TYPE_LABELS[r.type]) || (r.type ? titleCase(r.type) : (r.category ? titleCase(r.category) : 'Lieu')),
    addressLine:   formatAddress(r.address),
    openingHours:  x.opening_hours ?? null,
    phone:         x.phone || x['contact:phone'] || null,
    website:       x.website || x['contact:website'] || x.url || null,
    email:         x.email || x['contact:email'] || null,
    wheelchair:    x.wheelchair ?? null,
    cuisine:       x.cuisine ?? null,
    stars:         x.stars ?? null,
    operator:      x.operator ?? null,
    wikipedia,
    brand:         x.brand ?? null,
  }
}
