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
  addresstype:  string | null          // ex. "city", "tourism" (classe Nominatim)
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
    addresstype:  (r.addresstype as string)           ?? null,
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
  // Champs enrichis
  description:  string | null
  openNow:      boolean | null         // déduit de opening_hours simple si possible
  internet:     string | null          // wifi
  outdoor:      boolean                 // terrasse
  takeaway:     boolean                 // à emporter
  delivery:     boolean                 // livraison
  vegetarian:   boolean
  vegan:        boolean
  capacity:     string | null
  fee:          string | null          // payant ?
  amenityIcons: string[]               // petits badges (emoji) de commodités
}

// Libellés FR lisibles pour quelques types OSM courants (sinon on retombe sur le type brut).
const TYPE_LABELS: Record<string, string> = {
  station: 'Gare', train_station: 'Gare', railway_station: 'Gare', halt: 'Arrêt',
  bus_stop: 'Arrêt de bus', bus_station: 'Gare routière', subway_entrance: 'Entrée de métro',
  tram_stop: 'Arrêt de tram', platform: 'Quai', aerodrome: 'Aéroport', airport: 'Aéroport',
  restaurant: 'Restaurant', fast_food: 'Restauration rapide', cafe: 'Café', bar: 'Bar', pub: 'Pub',
  ice_cream: 'Glacier', biergarten: 'Brasserie', nightclub: 'Boîte de nuit',
  hotel: 'Hôtel', guest_house: "Maison d'hôtes", hostel: 'Auberge', motel: 'Motel', chalet: 'Chalet',
  museum: 'Musée', gallery: "Galerie d'art", artwork: "Œuvre d'art", monument: 'Monument',
  memorial: 'Mémorial', castle: 'Château', fort: 'Fort', ruins: 'Ruines', tower: 'Tour',
  archaeological_site: 'Site archéologique', heritage: 'Site historique',
  supermarket: 'Supermarché', convenience: 'Supérette', mall: 'Centre commercial',
  department_store: 'Grand magasin', bakery: 'Boulangerie', butcher: 'Boucherie',
  greengrocer: 'Primeur', clothes: 'Vêtements', books: 'Librairie', florist: 'Fleuriste',
  hairdresser: 'Coiffeur', beauty: 'Institut de beauté', marketplace: 'Marché',
  pharmacy: 'Pharmacie', hospital: 'Hôpital', clinic: 'Clinique', doctors: 'Cabinet médical',
  dentist: 'Dentiste', veterinary: 'Vétérinaire',
  school: 'École', university: 'Université', college: 'Lycée', kindergarten: 'École maternelle',
  bank: 'Banque', atm: 'Distributeur', bureau_de_change: 'Bureau de change',
  parking: 'Parking', fuel: 'Station-service', charging_station: 'Borne de recharge',
  park: 'Parc', garden: 'Jardin', playground: 'Aire de jeux', pitch: 'Terrain de sport',
  stadium: 'Stade', sports_centre: 'Centre sportif', swimming_pool: 'Piscine', zoo: 'Zoo',
  cinema: 'Cinéma', theatre: 'Théâtre', library: 'Bibliothèque', arts_centre: 'Centre culturel',
  attraction: 'Attraction', viewpoint: 'Point de vue', theme_park: "Parc d'attractions",
  place_of_worship: 'Lieu de culte', church: 'Église', cathedral: 'Cathédrale', mosque: 'Mosquée',
  synagogue: 'Synagogue', chapel: 'Chapelle',
  post_office: 'Bureau de poste', police: 'Police', fire_station: 'Caserne de pompiers',
  townhall: 'Mairie', courthouse: 'Palais de justice', embassy: 'Ambassade',
  toilets: 'Toilettes', drinking_water: 'Point d\'eau', bench: 'Banc', fountain: 'Fontaine',
  administrative: 'Zone administrative', city: 'Ville', town: 'Commune', village: 'Village',
  hamlet: 'Hameau', suburb: 'Quartier', neighbourhood: 'Quartier', quarter: 'Quartier',
  river: 'Rivière', stream: 'Ruisseau', water: "Plan d'eau", peak: 'Sommet', wood: 'Bois',
  forest: 'Forêt', beach: 'Plage', bridge: 'Pont',
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Catégorie lisible : on privilégie un tag plus parlant (tourism/historic/place/
// shop/amenity) au type brut Nominatim, puis on retombe sur la table de libellés.
function categoryLabelFor(r: SearchResult, x: Record<string, string>): string {
  // Ordre de priorité : monument/site (historic) > tourisme > localité (addresstype/place)
  // > commerce/aménité/loisir > type brut.
  const candidates = [
    x.historic, x.tourism, r.addresstype, x.place, x.shop, x.amenity, x.leisure,
    r.type, r.category,
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (TYPE_LABELS[c]) return TYPE_LABELS[c]
  }
  const first = candidates.find(c => c !== 'yes' && c !== 'administrative')
  return first ? titleCase(first) : 'Lieu'
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
  const yes = (v?: string) => v === 'yes' || v === 'only' || v === 'designated'
  const amenityIcons: string[] = []
  if (yes(x.wheelchair)) amenityIcons.push('♿')
  if (x.internet_access && x.internet_access !== 'no') amenityIcons.push('📶')
  if (yes(x.outdoor_seating)) amenityIcons.push('🌳')
  if (yes(x.takeaway)) amenityIcons.push('🥡')
  if (yes(x.delivery)) amenityIcons.push('🛵')
  if (yes(x['diet:vegetarian'])) amenityIcons.push('🥗')
  if (yes(x['diet:vegan'])) amenityIcons.push('🌱')
  if (yes(x.air_conditioning)) amenityIcons.push('❄️')
  if (x.smoking === 'no') amenityIcons.push('🚭')
  if (yes(x.dog) || x.dog === 'leashed') amenityIcons.push('🐕')

  return {
    title:         r.namedetails?.name || r.display_name.split(',')[0].trim(),
    categoryLabel: categoryLabelFor(r, x),
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
    description:   x.description ?? null,
    openNow:       null,
    internet:      x.internet_access && x.internet_access !== 'no' ? (x.internet_access === 'wlan' ? 'Wi-Fi' : x.internet_access) : null,
    outdoor:       yes(x.outdoor_seating),
    takeaway:      yes(x.takeaway),
    delivery:      yes(x.delivery),
    vegetarian:    yes(x['diet:vegetarian']),
    vegan:         yes(x['diet:vegan']),
    capacity:      x.capacity ?? null,
    fee:           x.fee ?? null,
    amenityIcons,
  }
}

// ── Photo + résumé d'un lieu (Wikipédia / Wikimedia Commons / tag image) ─────────

export interface PlacePhoto { photo: string | null; extract: string | null; credit: string | null }

/**
 * Récupère, quand c'est possible, une photo et un court résumé d'un lieu, à partir
 * de sources LIBRES : tag `wikipedia` (API REST résumé → vignette + extrait),
 * `wikimedia_commons`, tag `image` direct, ou `wikidata` (claim P18). Aucune clé.
 */
export async function fetchPlacePhoto(r: SearchResult): Promise<PlacePhoto> {
  const x = r.extratags ?? {}
  const none: PlacePhoto = { photo: null, extract: x.description ?? null, credit: null }

  // 1. Wikipédia (meilleure source : vignette + extrait).
  const wikiTag = x.wikipedia
  if (wikiTag && wikiTag.includes(':')) {
    const [lang, ...rest] = wikiTag.split(':')
    try {
      const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(rest.join(':'))}`)
      if (res.ok) {
        const j = await res.json()
        return {
          photo:   j.thumbnail?.source ?? j.originalimage?.source ?? null,
          extract: j.extract ?? x.description ?? null,
          credit:  'Wikipédia',
        }
      }
    } catch {/* réseau : on tente la suite */}
  }

  // 2. Wikimedia Commons (File:…).
  const commons = x.wikimedia_commons || x.image_commons
  if (commons && commons.startsWith('File:')) {
    return { photo: commonsFilePath(commons.slice(5)), extract: none.extract, credit: 'Wikimedia Commons' }
  }

  // 3. Tag image direct.
  if (x.image && /^https?:\/\//.test(x.image)) {
    return { photo: x.image, extract: none.extract, credit: null }
  }

  // 4. Wikidata → image P18.
  const qid = x.wikidata
  if (qid && /^Q\d+$/.test(qid)) {
    try {
      const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`)
      if (res.ok) {
        const j = await res.json()
        const img = j.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
        if (img) return { photo: commonsFilePath(img), extract: none.extract, credit: 'Wikimedia Commons' }
      }
    } catch {/* ignore */}
  }

  return none
}

function commonsFilePath(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`
}

export interface GalleryImage {
  thumb: string                 // vignette (≈ largeur srcset)
  full:  string                 // version grand format (Special:FilePath)
  title: string                 // « File:… » → page Commons
  page:  string                 // URL de la page Commons de l'image (source)
}

/**
 * Galerie de photos d'un lieu via l'API « media-list » de Wikipédia (toutes les
 * images de la page). Renvoie jusqu'à `limit` images avec vignette, grand format
 * et page source Commons (vide si pas de page wiki).
 */
export async function fetchPlaceGallery(r: SearchResult, limit = 12): Promise<GalleryImage[]> {
  const wikiTag = r.extratags?.wikipedia
  if (!wikiTag || !wikiTag.includes(':')) return []
  const [lang, ...rest] = wikiTag.split(':')
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(rest.join(':'))}`)
    if (!res.ok) return []
    const j = await res.json()
    const out: GalleryImage[] = []
    for (const it of (j.items ?? [])) {
      if (it.type !== 'image' || !Array.isArray(it.srcset) || !it.srcset.length) continue
      let thumb: string = it.srcset[0].src
      if (thumb.startsWith('//')) thumb = 'https:' + thumb
      if (/\.svg/i.test(thumb) || /logo|Commons-logo|Edit-clear|Ambox|Question_book|_map|Blason|flag/i.test(thumb)) continue
      // Le préfixe de namespace est localisé (File:/Fichier:/Datei:…) → on garde
      // ce qui suit le premier « : » et on normalise en « File: » pour Commons.
      const rawTitle: string = it.title || ''
      const file = rawTitle.includes(':') ? rawTitle.slice(rawTitle.indexOf(':') + 1) : rawTitle
      out.push({
        thumb,
        full:  file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1280` : thumb,
        title: file,
        page:  file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` : thumb,
      })
      if (out.length >= limit) break
    }
    return out
  } catch { return [] }
}
