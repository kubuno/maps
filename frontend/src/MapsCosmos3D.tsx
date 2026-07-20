import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { X, Telescope, MapPin } from 'lucide-react'
import { api } from '@kubuno/sdk'
import { worldById, type World } from './worlds'

// Faithful port of the standalone PHP "Système Solaire 3D" (Three.js) into the
// Kubuno maps module: real star catalog + constellations + Milky Way, a fully
// procedural Sun (Perlin cubemap ocean + glow ring + filament rays + magma
// flares + screen-space lens flare + eclipse corona), eight planets with real
// orbital data, on-demand LOD texture streaming, gas-giant differential
// rotation, ray-marched volumetric clouds, cloud/ring shadows and atmospheres.
//
// Textures and the star/constellation catalogs are served self-hosted by the
// maps backend (a Rust port of the original texture.php), never from a CDN.

const deg = THREE.MathUtils.degToRad

// Self-hosted asset endpoints (proxied core → maps module).
const API_BASE = (((api as unknown as { defaults?: { baseURL?: string } }).defaults?.baseURL) ?? '/api/v1').replace(/\/$/, '')
const COSMOS = `${API_BASE}/maps/cosmos`
const texUrl = (file: string, size: number) => `${COSMOS}/texture?file=${encodeURIComponent(file)}&size=${size}`

// Map a solar-system body (French name) to a mappable 2D world, when one exists.
const WORLD_OF: Record<string, string> = { Terre: 'earth', Lune: 'moon', Mars: 'mars' }
// Body the camera should start on, given the current 2D world.
const BODY_OF: Record<string, string> = { earth: 'Terre', moon: 'Lune', mars: 'Mars' }

/* ---------------------------------------------------------- real-world data
   radius (Earth = 1), distance (AU), orbital period (days),
   rotation (days; negative = retrograde), axial tilt (deg). */
interface Moon {
  name: string; km: number; dist: number; period: number; tint?: number
  tex?: string; bump?: string; normal?: string; info: string
}
interface Planet {
  name: string; radius: number; au: number; period: number; day: number; tilt: number
  orbIncl: number; sizeMul?: number; gapBefore?: number; map?: string; earth?: boolean
  gas?: { jets: number; speed: number; swirl: number }
  rings?: { inner: number; outer: number; opacity?: number; style?: string; color?: number[]; texture?: string }
  moons?: Moon[]; info: string
}

const PLANETS: Planet[] = [
  { name: 'Mercure', radius: 0.383, au: 0.39, period: 88, day: 58.6, tilt: 0.03, orbIncl: 7.0,
    map: '8k_mercury.jpg',
    info: 'Plus proche du Soleil. Température de -180 °C à 430 °C. Aucune atmosphère.' },
  { name: 'Vénus', radius: 0.949, au: 0.72, period: 224.7, day: 243, tilt: 177.4, orbIncl: 3.39,
    map: '8k_venus_surface.jpg',
    gas: { jets: 3, speed: 0.22, swirl: 0.002 },
    info: 'Rotation rétrograde. Effet de serre extrême : 465 °C en surface.' },
  { name: 'Terre', radius: 1.0, au: 1.0, period: 365.25, day: 1, tilt: 23.4, orbIncl: 0,
    earth: true,
    moons: [{ name: 'Lune', km: 1737, dist: 2.6, period: 27.3, tint: 0xffffff,
      info: 'Satellite naturel de la Terre, à 384 400 km. Toujours la même face visible (rotation synchrone).' }],
    info: 'Seule planète connue abritant la vie. Un satellite naturel : la Lune.' },
  { name: 'Mars', radius: 0.532, au: 1.52, period: 687, day: 1.03, tilt: 25.2, orbIncl: 1.85,
    map: '8k_mars.jpg',
    moons: [
      { name: 'Phobos', km: 11, dist: 1.9, period: 0.32, tint: 0x9a8d80,
        info: 'Minuscule (22 km), il orbite en 7 h 39 — plus vite que Mars ne tourne. Il finira par s\'y écraser.' },
      { name: 'Déimos', km: 6, dist: 2.5, period: 1.26, tint: 0xa89a8a,
        info: 'Le plus petit (12 km) et le plus lointain des deux satellites martiens.' },
    ],
    info: 'La planète rouge. Abrite le mont Olympe, plus haut volcan du système solaire.' },
  { name: 'Jupiter', radius: 11.21, au: 5.20, period: 4333, day: 0.41, tilt: 3.1, sizeMul: 4, orbIncl: 1.30, gapBefore: 56,
    map: '8k_jupiter.jpg',
    gas: { jets: 12, speed: 0.004, swirl: 0.005 },
    rings: { inner: 1.3, outer: 1.8, opacity: 0.10, style: 'diffuse', color: [200, 170, 140] },
    moons: [
      { name: 'Io', km: 1822, dist: 2.0, period: 1.77, tex: 'jup_io_diff.jpg', bump: 'jup_io_bump.jpg', normal: 'jup_io_norm.jpg',
        info: 'Le corps le plus volcanique du système solaire, pétri par les marées de Jupiter.' },
      { name: 'Europe', km: 1561, dist: 2.5, period: 3.55, tex: 'jup_europa_diff.jpg', bump: 'jup_europa_bump.jpg', normal: 'jup_europa_norm.jpg',
        info: 'Un océan d\'eau liquide sous la banquise — l\'un des meilleurs candidats à la vie.' },
      { name: 'Ganymède', km: 2634, dist: 3.1, period: 7.15, tex: 'jup_ganymede_diff.jpg', bump: 'jup_ganymede_bump.jpg', normal: 'jup_ganymede_norm.jpg',
        info: 'La plus grosse lune du système solaire, plus grande que Mercure.' },
      { name: 'Callisto', km: 2410, dist: 3.8, period: 16.7, tex: 'jup_callisto_diff.jpg',
        info: 'Surface criblée de cratères, parmi les plus anciennes du système solaire.' },
    ],
    info: 'La plus grosse planète : 318 masses terrestres. Sa Grande Tache rouge est une tempête géante.' },
  { name: 'Saturne', radius: 9.45, au: 9.58, period: 10759, day: 0.45, tilt: 26.7, sizeMul: 4, orbIncl: 2.49, gapBefore: 30,
    map: '8k_saturn.jpg',
    gas: { jets: 10, speed: 0.0028, swirl: 0.003 },
    rings: { inner: 1.35, outer: 2.4, texture: '8k_saturn_ring_alpha.png' },
    moons: [
      { name: 'Encelade', km: 252, dist: 2.55, period: 1.37, tint: 0xf0f0f5, info: 'Geysers de glace au pôle sud alimentés par un océan interne.' },
      { name: 'Rhéa', km: 764, dist: 2.85, period: 4.5, tint: 0xcfc8c0, info: 'Boule de glace criblée de cratères, deuxième lune de Saturne.' },
      { name: 'Titan', km: 2575, dist: 3.4, period: 15.9, tint: 0xd8a050, info: 'Épaisse atmosphère d\'azote et lacs de méthane liquide — unique dans le système solaire.' },
    ],
    info: 'Célèbre pour ses anneaux de glace et de roche. Densité inférieure à celle de l\'eau.' },
  { name: 'Uranus', radius: 4.01, au: 19.2, period: 30687, day: 0.72, tilt: 97.8, sizeMul: 4, orbIncl: 0.77, gapBefore: 30,
    map: '2k_uranus.jpg',
    gas: { jets: 5, speed: 0.0015, swirl: 0.002 },
    rings: { inner: 1.55, outer: 1.95, opacity: 0.35, style: 'narrow', color: [170, 185, 200] },
    moons: [
      { name: 'Titania', km: 789, dist: 2.2, period: 8.7, tint: 0xb8aca0, info: 'La plus grande lune d\'Uranus, canyons géants et glace.' },
      { name: 'Obéron', km: 761, dist: 2.8, period: 13.5, tint: 0xa89a90, info: 'La plus lointaine des grandes lunes d\'Uranus.' },
    ],
    info: 'Roule sur le côté : son axe est incliné à 98°. Géante de glaces.' },
  { name: 'Neptune', radius: 3.88, au: 30.05, period: 60190, day: 0.67, tilt: 28.3, sizeMul: 4, orbIncl: 1.77, gapBefore: 30,
    map: '2k_neptune.jpg',
    gas: { jets: 6, speed: 0.006, swirl: 0.005 },
    rings: { inner: 1.45, outer: 1.75, opacity: 0.12, style: 'narrow', color: [150, 150, 170] },
    moons: [{ name: 'Triton', km: 1353, dist: 2.4, period: -5.88, tint: 0xd0c0b8, info: 'Orbite rétrograde : sans doute un objet de la ceinture de Kuiper capturé. Geysers d\'azote.' }],
    info: 'La plus lointaine. Vents les plus rapides du système solaire : 2 100 km/h.' },
]

// Scene scales: compression so everything stays visible.
const sizeScale = (au: number) => 14 + Math.pow(au, 0.62) * 26
const radScale = (r: number) => 0.55 + Math.pow(r, 0.55) * 0.9
const SUN_RADIUS = 5
const SUN_SCALE = SUN_RADIUS / 1.5 // their constants are tuned for r = 1.5

interface Selectable {
  name: string; mesh: THREE.Mesh; rad: number; sun?: boolean; moon?: boolean; info: string
  au?: number; period?: number; radius?: number
}
interface SelInfo { name: string; info: string; stats: string; worldId?: string }

// Controls exposed by the running scene to the React overlay.
interface Ctl {
  setPaused: (b: boolean) => void
  setSpeed01: (v: number) => void
  setShowOrbits: (b: boolean) => void
  setShowLabels: (b: boolean) => void
  setShowConst: (b: boolean) => void
  setFlare: (key: string, val: number) => void
  follow: (name: string | null) => void
  resetView: () => void
}

const PLANET_NAMES = ['Soleil', ...PLANETS.map(p => p.name)]

const SPEED_MIN = 1 / 24, SPEED_MAX = 60
function speedFrom01(t: number) { return SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, t) }
function formatSpeed(d: number) {
  if (d < 1) {
    const h = d * 24
    const txt = h < 10 ? h.toFixed(1).replace('.', ',') : String(Math.round(h))
    return txt + (h < 1.95 ? ' heure' : ' heures')
  }
  const txt = d < 10 ? d.toFixed(1).replace('.', ',') : String(Math.round(d))
  return txt + (d < 2 ? ' jour' : ' jours')
}

export function MapsCosmos3D({
  currentId, onTravel, onClose,
}: {
  currentId: string
  onTravel: (w: World) => void
  onClose: () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef<HTMLElement>(null)
  const lodRef = useRef<HTMLSpanElement>(null)
  const ctlRef = useRef<Ctl | null>(null)
  // Live UI values shared between React handlers and the animation loop.
  const uiRef = useRef({ speed01: 0, paused: false, showOrbits: true, showLabels: true, showConst: true })
  // Latest callbacks, so the scene effect never needs to rebuild on their change.
  const onTravelRef = useRef(onTravel); onTravelRef.current = onTravel

  // React-controlled overlay state.
  const [speed01, setSpeed01] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showOrbits, setShowOrbits] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showConst, setShowConst] = useState(true)
  const [flareOpen, setFlareOpen] = useState(false)
  const [flare, setFlare] = useState({ size: 100, brightness: 100, star: 100, halo: 100, nearFade: 15 })
  const [selected, setSelected] = useState<SelInfo | null>(null)
  const [webglError, setWebglError] = useState(false)

  useEffect(() => {
    const mount = mountRef.current, labelHost = labelsRef.current
    if (!mount || !labelHost) return
    let cancelled = false
    let dispose = () => {}

    ;(async () => {
      // The texture manifest (filename → native width) gates each map's LOD.
      let manifest: Record<string, number> = {}
      try {
        const res = await fetch(`${COSMOS}/manifest`, { credentials: 'include' })
        if (res.ok) manifest = await res.json()
      } catch { /* keep empty: LOD ceilings default low */ }
      if (cancelled || !mountRef.current) return
      dispose = build(manifest)
    })()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function build(TEXTURE_MANIFEST: Record<string, number>): () => void {
      const ui = uiRef.current
      let W = mount!.clientWidth || 1200, H = mount!.clientHeight || 800

      let renderer: THREE.WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true })
      } catch {
        // No WebGL context (e.g. headless/software rendering): fail gracefully.
        setWebglError(true)
        return () => {}
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(W, H)
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      renderer.autoClear = true
      mount!.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 4000)
      camera.position.set(0, 60, 140)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.maxDistance = 900
      controls.minDistance = 1.2

      scene.add(new THREE.AmbientLight(0x334466, 0.25))
      const sunLight = new THREE.PointLight(0xfff2d8, 2600, 0, 2)
      scene.add(sunLight)

      /* --------------------------------------------------- texture loader (LOD) */
      const texLoader = new THREE.TextureLoader()
      texLoader.setWithCredentials(true)
      const MAX_ANISO = renderer.capabilities.getMaxAnisotropy()
      const configureTex = (t: THREE.Texture, { srgb = true, wrapX = false } = {}) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = MAX_ANISO
        if (wrapX) t.wrapS = THREE.RepeatWrapping
        return t
      }
      const loadMap = (path: string, opts = {}) => configureTex(texLoader.load(path), opts)

      // Each body starts at 512 px and climbs/falls (up to 8K) with its apparent
      // on-screen size, sampled twice a second; unused high resolutions are freed
      // from GPU memory. Full-resolution pyramid (not a Google-Maps-style tile
      // grid): a sphere always shows ~half its map, so tiling would add little.
      const LOD_SIZES = [512, 1024, 2048, 4096, 8192]
      interface LodEntry { file: string; opts: Record<string, unknown>; apply: (t: THREE.Texture) => void; maxW: number; current: number; loading: number; tex: THREE.Texture | null }
      const lodBodies: { mesh: THREE.Object3D; rad: number; entries: LodEntry[] }[] = []

      const lodTexture = (file: string, opts: Record<string, unknown>, apply: (t: THREE.Texture) => void): LodEntry => {
        const entry: LodEntry = { file, opts, apply, maxW: TEXTURE_MANIFEST[file] || 2048, current: 0, loading: 0, tex: null }
        const size = Math.min(LOD_SIZES[0], entry.maxW)
        entry.tex = configureTex(texLoader.load(texUrl(file, size)), opts)
        entry.current = size
        apply(entry.tex)
        return entry
      }
      const setLOD = (entry: LodEntry, size: number) => {
        size = Math.min(size, entry.maxW)
        if (entry.current === size || entry.loading === size) return
        entry.loading = size
        texLoader.load(texUrl(entry.file, size), t => {
          if (entry.loading !== size) { t.dispose(); return }
          configureTex(t, entry.opts)
          const old = entry.tex
          entry.tex = t; entry.current = size; entry.loading = 0
          entry.apply(t)
          if (old) old.dispose()
        })
      }
      const mapApplier = (mat: THREE.Material & Record<string, unknown>, prop: string) => (t: THREE.Texture) => {
        const had = !!mat[prop]
        ;(mat as Record<string, unknown>)[prop] = t
        if (!had) mat.needsUpdate = true
      }
      const _lodPos = new THREE.Vector3()
      const updateLODs = () => {
        const pxFactor = H / (2 * Math.tan(deg(camera.fov / 2)))
        for (const lb of lodBodies) {
          lb.mesh.getWorldPosition(_lodPos)
          const dist = Math.max(camera.position.distanceTo(_lodPos) - lb.rad, 0.1)
          const screenDiam = (lb.rad * 2 / dist) * pxFactor
          const needed = screenDiam * 3.2
          let size = LOD_SIZES[LOD_SIZES.length - 1]
          for (const s of LOD_SIZES) if (s >= needed) { size = s; break }
          for (const e of lb.entries) setLOD(e, size)
        }
        if (lodRef.current) {
          const lb = followed && lodBodies.find(l => l.mesh === (followed as Selectable).mesh)
          lodRef.current.textContent = lb ? ` · Texture ${lb.entries[0].current} px` : ''
        }
      }

      /* ------------------------------------------------------------- real sky */
      const SKY_R = 3000
      const skyGroup = new THREE.Group()
      skyGroup.rotation.x = deg(-23.4368)
      scene.add(skyGroup)

      const radecToVec = (raDeg: number, decDeg: number, r: number) => {
        const ra = deg(raDeg), dec = deg(decDeg)
        return new THREE.Vector3(r * Math.cos(dec) * Math.cos(ra), r * Math.sin(dec), -r * Math.cos(dec) * Math.sin(ra))
      }
      const BV_STOPS: [number, number[]][] = [
        [-0.3, [0.61, 0.69, 1.00]], [0.0, [0.80, 0.86, 1.00]], [0.4, [1.00, 0.98, 0.94]],
        [0.8, [1.00, 0.92, 0.78]], [1.5, [1.00, 0.80, 0.56]], [2.0, [1.00, 0.70, 0.46]],
      ]
      const bvToColor = (bv: number) => {
        let a = BV_STOPS[0], b = BV_STOPS[BV_STOPS.length - 1]
        for (let i = 0; i < BV_STOPS.length - 1; i++)
          if (bv >= BV_STOPS[i][0] && bv <= BV_STOPS[i + 1][0]) { a = BV_STOPS[i]; b = BV_STOPS[i + 1]; break }
        const t = Math.min(1, Math.max(0, (bv - a[0]) / ((b[0] - a[0]) || 1)))
        return [0, 1, 2].map(k => a[1][k] + (b[1][k] - a[1][k]) * t)
      }
      const starMat = new THREE.ShaderMaterial({
        vertexShader: `attribute float size; varying vec3 vColor;
          void main(){ vColor = color; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 vColor;
          void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vColor, a * a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      })
      fetch(`${COSMOS}/data/stars.6.json`, { credentials: 'include' }).then(r => r.json()).then(cat => {
        const feats = cat.features, N = feats.length
        const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        feats.forEach((f: any, i: number) => {
          const [ra, dec] = f.geometry.coordinates
          const v = radecToVec(ra, dec, SKY_R)
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z
          const mag = f.properties.mag
          const c = bvToColor(parseFloat(f.properties.bv) || 0.5)
          const lum = Math.min(1, Math.pow(10, -0.28 * (mag - 1.2)))
          col[i * 3] = c[0] * lum; col[i * 3 + 1] = c[1] * lum; col[i * 3 + 2] = c[2] * lum
          size[i] = mag < 0.5 ? 9 : mag < 1.5 ? 7 : mag < 2.5 ? 5.5 : mag < 4 ? 4 : 2.8
        })
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        geo.setAttribute('size', new THREE.BufferAttribute(size, 1))
        skyGroup.add(new THREE.Points(geo, starMat))
      }).catch(() => {})

      let constellationLines: THREE.LineSegments | null = null
      fetch(`${COSMOS}/data/constellations.lines.json`, { credentials: 'include' }).then(r => r.json()).then(cat => {
        const pts: THREE.Vector3[] = []
        for (const f of cat.features)
          for (const line of f.geometry.coordinates)
            for (let i = 0; i < line.length - 1; i++) {
              pts.push(radecToVec(line[i][0], line[i][1], SKY_R * 0.995))
              pts.push(radecToVec(line[i + 1][0], line[i + 1][1], SKY_R * 0.995))
            }
        constellationLines = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x5b74b8, transparent: true, opacity: 0.15 }))
        constellationLines.visible = ui.showConst
        skyGroup.add(constellationLines)
      }).catch(() => {})

      // Milky Way: 8K panorama mapped in galactic coordinates.
      {
        const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 64, 32),
          new THREE.MeshBasicMaterial({ map: loadMap(texUrl('8k_stars_milky_way.jpg', 4096)), side: THREE.BackSide, color: 0x666677 }))
        const Xg = radecToVec(266.405, -28.936, 1)  // galactic centre (Sagittarius)
        const Zg = radecToVec(192.859, 27.128, 1)   // north galactic pole
        const Yg = new THREE.Vector3().crossVectors(Zg, Xg).normalize()
        sky.setRotationFromMatrix(new THREE.Matrix4().makeBasis(Xg, Zg, Yg.negate()))
        skyGroup.add(sky)
      }

      /* --------------------------------------------------- procedural Sun
         Port of the fwdapps "sun": (1) a simplex-noise cubemap re-baked each
         frame, (2) a sphere summing three rotating layers of it, (3) a
         camera-facing glow ring, (4) 4095 filament rays, (5) 2047 magma flares.
         Adapted to radius 5, always visible (uVisibility = 1), depth-tested so
         planets can occlude the glow. */
      const PERLIN_VS = `varying vec3 vWorld;
        void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`
      const PERLIN_FS = `varying vec3 vWorld;
        uniform float uTime; uniform float uSpatialFrequency; uniform float uTemporalFrequency; uniform float uH; uniform float uContrast; uniform float uFlatten;
        #ifndef OCTAVES
        #define OCTAVES 5
        #endif
        vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
        float mod289(float x){ return x - floor(x * (1.0/289.0)) * 289.0; }
        vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
        float permute(float x){ return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
        float taylorInvSqrt(float r){ return 1.79284291400159 - 0.85373472095314 * r; }
        vec4 grad4(float j, vec4 ip) {
          const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0); vec4 p, s;
          p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
          p.w = 1.5 - dot(abs(p.xyz), ones.xyz); s = vec4(lessThan(p, vec4(0.0)));
          p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www; return p;
        }
        #define F4 0.309016994374947451
        float snoise(vec4 v) {
          const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
          vec4 i = floor(v + dot(v, vec4(F4))); vec4 x0 = v - i + dot(i, C.xxxx);
          vec4 i0; vec3 isX = step(x0.yzw, x0.xxx); vec3 isYZ = step(x0.zww, x0.yyz);
          i0.x = isX.x + isX.y + isX.z; i0.yzw = 1.0 - isX; i0.y += isYZ.x + isYZ.y; i0.zw += 1.0 - isYZ.xy; i0.z += isYZ.z; i0.w += 1.0 - isYZ.z;
          vec4 i3 = clamp(i0, 0.0, 1.0); vec4 i2 = clamp(i0-1.0, 0.0, 1.0); vec4 i1 = clamp(i0-2.0, 0.0, 1.0);
          vec4 x1 = x0 - i1 + C.xxxx; vec4 x2 = x0 - i2 + C.yyyy; vec4 x3 = x0 - i3 + C.zzzz; vec4 x4 = x0 + C.wwww;
          i = mod289(i);
          float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
          vec4 j1 = permute(permute(permute(permute(i.w + vec4(i1.w, i2.w, i3.w, 1.0)) + i.z + vec4(i1.z, i2.z, i3.z, 1.0)) + i.y + vec4(i1.y, i2.y, i3.y, 1.0)) + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
          vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
          vec4 p0 = grad4(j0, ip); vec4 p1 = grad4(j1.x, ip); vec4 p2 = grad4(j1.y, ip); vec4 p3 = grad4(j1.z, ip); vec4 p4 = grad4(j1.w, ip);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w; p4 *= taylorInvSqrt(dot(p4,p4));
          vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0); vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
          m0 = m0 * m0; m1 = m1 * m1;
          return 49.0 * (dot(m0*m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) + dot(m1*m1, vec2(dot(p3, x3), dot(p4, x4))));
        }
        vec2 fbm(vec4 p){ float a = 1.0; float f = 1.0; vec2 sum = vec2(0.0);
          for (int i = 0; i < OCTAVES; i++){ sum.x += snoise(p * f) * a; p.w += 100.0; sum.y += snoise(p * f) * a; a *= uH; f *= 2.0; } return sum; }
        void main(){
          vec3 world = normalize(vWorld); world += 12.45;
          vec4 p = vec4(world * uSpatialFrequency, uTime * uTemporalFrequency);
          vec2 f = fbm(p) * uContrast + 0.5;
          vec4 p2 = vec4(world * 2.0, uTime * uTemporalFrequency);
          float modulate = max(snoise(p2), 0.0);
          float x = mix(f.x, f.x * modulate, uFlatten);
          gl_FragColor = vec4(x, f.y, f.y, x);
        }`

      const perlinScene = new THREE.Scene()
      const sunCubeRT = new THREE.WebGLCubeRenderTarget(512, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, generateMipmaps: false })
      const sunCubeCam = new THREE.CubeCamera(0.1, 100, sunCubeRT)
      const perlinMat = new THREE.ShaderMaterial({
        vertexShader: PERLIN_VS, fragmentShader: PERLIN_FS, depthWrite: false, side: THREE.BackSide,
        defines: { OCTAVES: 6 },
        uniforms: { uTime: { value: 0 }, uSpatialFrequency: { value: 7 }, uTemporalFrequency: { value: 0.1 }, uH: { value: 1 }, uContrast: { value: 0.28 }, uFlatten: { value: 0.72 } },
      })
      perlinScene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), perlinMat))

      // Shared visibility uniforms (their day/night system, forced "visible").
      const sunVisUniforms = () => ({ uVisibility: { value: 1 }, uDirection: { value: 1 }, uLightView: { value: new THREE.Vector3(1, 1, 1).normalize() } })

      const sunUniforms = { time: { value: 0 } }
      const sunMaterial = new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vWorld; varying vec3 vNormalView; varying vec3 vNormalWorld; varying vec3 vLayer0; varying vec3 vLayer1; varying vec3 vLayer2;
          uniform float uTime;
          mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
          void setLayers(vec3 p){ float t = uTime;
            vec3 p1 = p; p1.yz = rot(t) * p1.yz; vLayer0 = p1;
            p1 = p; p1.zx = rot(t + 2.094) * p1.zx; vLayer1 = p1;
            p1 = p; p1.xy = rot(t - 4.188) * p1.xy; vLayer2 = p1; }
          void main(){ vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
            vNormalView = normalize(normalMatrix * normal);
            vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            setLayers(normalize(normal));
            gl_Position = projectionMatrix * viewMatrix * world; }`,
        fragmentShader: `uniform float uVisibility; uniform float uDirection; uniform vec3 uLightView;
          float getAlpha(vec3 n){ float nDotL = dot(n, uLightView) * uDirection; return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5); }
          varying vec3 vWorld; varying vec3 vNormalView; varying vec3 vNormalWorld; varying vec3 vLayer0; varying vec3 vLayer1; varying vec3 vLayer2;
          uniform samplerCube uPerlinCube;
          uniform float uFresnelPower; uniform float uFresnelInfluence; uniform float uTint; uniform float uBase; uniform float uBrightnessOffset; uniform float uCoreGain; uniform float uBrightness;
          vec3 brightnessToColor(float b){ b *= uTint; return (vec3(b, b*b, b*b*b*b) / uTint) * uBrightness; }
          float ocean(){ float s = 0.0; s += textureCube(uPerlinCube, vLayer0).r; s += textureCube(uPerlinCube, vLayer1).r; s += textureCube(uPerlinCube, vLayer2).r; return s * 0.3333333; }
          void main(){
            vec3 Vview = normalize((viewMatrix * vec4(vWorld - cameraPosition, 0.0)).xyz);
            float nDotV = dot(vNormalView, -Vview);
            float fresnel = pow(1.0 - nDotV, uFresnelPower) * uFresnelInfluence;
            float brightness = ocean() * uBase + uBrightnessOffset + fresnel;
            vec3 col = clamp(brightnessToColor(brightness), 0.0, 1.0);
            float rProj = sqrt(max(1.0 - nDotV * nDotV, 0.0));
            float coreA = exp(-pow(rProj / 1.05, 2.0) * 1.6);
            col += vec3(1.0, 1.0, 0.98) * (0.8 * coreA * uCoreGain);
            float a = getAlpha(normalize(vNormalWorld));
            gl_FragColor = vec4(col, a);
          }`,
        transparent: true, premultipliedAlpha: true, depthWrite: true,
        uniforms: {
          uTime: { value: 0 }, uPerlinCube: { value: sunCubeRT.texture },
          uFresnelPower: { value: 1.25 }, uFresnelInfluence: { value: 1.0 }, uTint: { value: 0.2 }, uBase: { value: 4 },
          uBrightnessOffset: { value: 1.12 }, uBrightness: { value: 0.78 }, uCoreGain: { value: 1 }, ...sunVisUniforms(),
        },
      })
      const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 64), sunMaterial)
      scene.add(sun)

      // Glow ring (geometry baked at world radius).
      const glowMat = new THREE.ShaderMaterial({
        vertexShader: `attribute vec3 aPos; varying float vRadial; varying vec3 vWorld;
          uniform mat4 uViewProjection; uniform float uRadius; uniform vec3 uCamUp; uniform vec3 uCamPos;
          void main(void){ vRadial = aPos.z;
            vec3 fwd = normalize(uCamPos);
            vec3 refUp = (abs(fwd.y) < 0.95) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 side = normalize(cross(refUp, fwd)); vec3 up2 = cross(fwd, side);
            vec3 p = aPos.x * side + aPos.y * up2; p *= 1.0 + aPos.z * uRadius;
            vec4 world = vec4(p, 1.0); vWorld = world.xyz; gl_Position = uViewProjection * world; }`,
        fragmentShader: `uniform float uVisibility; uniform float uDirection; uniform vec3 uLightView;
          float getAlpha(vec3 n){ float nDotL = dot(n, uLightView) * uDirection; return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5); }
          varying float vRadial; varying vec3 vWorld;
          uniform float uTint; uniform float uBrightness; uniform float uFalloffColor;
          vec3 brightnessToColor(float b){ b *= uTint; return (vec3(b, b*b, b*b*b*b) / (uTint)) * uBrightness; }
          void main(void){ float alpha = (1.0 - vRadial); alpha *= alpha; float brightness = 1.0 + alpha * uFalloffColor;
            alpha *= getAlpha(normalize(vWorld)); gl_FragColor.xyz = brightnessToColor(brightness) * alpha; gl_FragColor.w = alpha; }`,
        transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
        uniforms: { uViewProjection: { value: new THREE.Matrix4() }, uRadius: { value: 0.52 }, uTint: { value: 0.4 }, uBrightness: { value: 1.3 }, uFalloffColor: { value: 0.65 }, uCamUp: { value: new THREE.Vector3(0, 1, 0) }, uCamPos: { value: new THREE.Vector3() }, ...sunVisUniforms() },
      })
      {
        const segments = 134, rSphere = SUN_RADIUS * 0.995
        const positions = new Float32Array(3 * 2 * segments)
        let r = 0
        for (let a = 0; a < segments; a++) {
          const s = a / segments * Math.PI * 2
          const sx = Math.sin(s) * rSphere, sy = Math.cos(s) * rSphere
          positions[r++] = sx; positions[r++] = sy; positions[r++] = 0
          positions[r++] = sx; positions[r++] = sy; positions[r++] = 1
        }
        const indices = new Uint16Array(2 * segments * 3)
        let o = 0
        for (let a = 0; a < segments; a++) {
          const i0 = 2 * a, i1 = 2 * a + 1, i2 = 2 * ((a + 1) % segments), i3 = i2 + 1
          indices[o++] = i0; indices[o++] = i1; indices[o++] = i2; indices[o++] = i2; indices[o++] = i1; indices[o++] = i3
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('aPos', new THREE.Float32BufferAttribute(positions, 3))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))
        const glowMesh = new THREE.Mesh(geo, glowMat)
        glowMesh.frustumCulled = false; glowMesh.renderOrder = 2; scene.add(glowMesh)
      }

      // Filament rays.
      const raysMat = new THREE.ShaderMaterial({
        vertexShader: `attribute vec3 aPos; attribute vec3 aPos0; attribute vec4 aWireRandom;
          varying float vUVY; varying float vOpacity; varying vec3 vColor; varying vec3 vNormal;
          uniform float uHueSpread; uniform float uHue; uniform float uLength; uniform float uWidth; uniform float uTime; uniform float uNoiseFrequency; uniform float uNoiseAmplitude; uniform vec3 uCamPos; uniform mat4 uViewProjection; uniform float uOpacity;
          #define m4 mat4( 0.00, 0.80, 0.60, -0.4, -0.80, 0.36, -0.48, -0.5, -0.60, -0.48, 0.64, 0.2, 0.40, 0.30, 0.20, 0.4)
          vec4 twistedSineNoise(vec4 q, float falloff){ float a = 1.; float f = 1.; vec4 sum = vec4(0);
            for (int i = 0; i < 4; i++) { q = m4 * q; vec4 s = sin(q.ywxz * f) * a; q += s; sum += s; a *= falloff; f /= falloff; } return sum; }
          vec3 getPos(float phase, float animPhase){ float size = aWireRandom.z + 0.2; float d = phase * uLength * size; vec3 p = aPos0 + aPos0 * d;
            p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (d * uNoiseAmplitude); return p; }
          vec3 spectrum(in float d){ return smoothstep(0.25, 0., abs(d + vec3(-0.375, -0.5, -0.625))); }
          void main(void) { vUVY = aPos.z; float animPhase = fract(uTime * 0.3 * (aWireRandom.y * 0.5) + aWireRandom.x);
            vec3 p = getPos(aPos.x, animPhase); vec3 p1 = getPos(aPos.x + 0.01, animPhase);
            vec3 p0w = (modelMatrix * vec4(p , 1.0)).xyz; vec3 p1w = (modelMatrix * vec4(p1, 1.0)).xyz;
            vec3 dirW = normalize(p1w - p0w); vec3 vW = normalize(p0w - uCamPos); vec3 sideW = normalize(cross(vW, dirW));
            if (length(sideW) < 1e-6) { vec3 up = (abs(dirW.y) < 0.99) ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0); sideW = normalize(cross(up, dirW)); }
            float width = uWidth * aPos.z * (1.0 - aPos.x); vec3 pWorld = p0w + sideW * width; vNormal = normalize(pWorld);
            vOpacity = uOpacity * (0.5 + aWireRandom.w); vColor = spectrum(aWireRandom.w * uHueSpread + uHue);
            gl_Position = uViewProjection * vec4(pWorld, 1.0); }`,
        fragmentShader: `uniform float uVisibility; uniform float uDirection; uniform vec3 uLightView;
          float getAlpha(vec3 n){ float nDotL = dot(n, uLightView) * uDirection; return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5); }
          varying float vUVY; varying float vOpacity; varying vec3 vColor; varying vec3 vNormal; uniform float uAlphaBlended;
          void main(void) { float alpha = 1.0 - smoothstep(0.0, 1.0, abs(vUVY)); alpha *= alpha; alpha *= vOpacity; alpha *= getAlpha(vNormal); gl_FragColor = vec4(vColor * alpha, alpha); }`,
        transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uViewProjection: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uTime: { value: 0 }, uWidth: { value: 0.03 * SUN_SCALE }, uLength: { value: 0.6 }, uOpacity: { value: 0.05 }, uNoiseFrequency: { value: 6 / SUN_SCALE }, uNoiseAmplitude: { value: 0.4 * SUN_SCALE }, uAlphaBlended: { value: 0.3 }, uHueSpread: { value: 0.2 }, uHue: { value: 0.2 }, ...sunVisUniforms() },
      })
      {
        const lineCount = 4095, lineLength = 24, R = SUN_RADIUS * 0.995
        const totalVerts = lineCount * lineLength * 2
        const aPos = new Float32Array(totalVerts * 3), aPos0 = new Float32Array(totalVerts * 3), aRnd = new Float32Array(totalVerts * 4)
        const indices = new Uint32Array(lineCount * (lineLength - 1) * 6)
        const held = new THREE.Vector3(), jit = new THREE.Vector3()
        const randomUnit = (v: THREE.Vector3) => { const z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z); return v.set(r * Math.cos(t), r * Math.sin(t), z) }
        let ip = 0, i0 = 0, ir = 0, ii = 0, d = 0, p = 0
        for (let v = 0; v < lineCount; v++) {
          if (Math.random() < 0.1 || v === 0) { randomUnit(held).normalize(); d = Math.random(); p = Math.random() }
          const base = held.clone().add(randomUnit(jit).multiplyScalar(0.025)).normalize()
          const rands = [d, p, Math.random(), Math.random()]
          for (let m = 0; m < lineLength; m++) {
            const vb = 2 * (v * lineLength + m)
            for (let y = 0; y <= 1; y++) {
              aPos[ip++] = (m + 0.5) / lineLength; aPos[ip++] = (v + 0.5) / lineCount; aPos[ip++] = 2 * y - 1
              for (let t = 0; t < 4; t++) aRnd[ir++] = rands[t]
              aPos0[i0++] = base.x * R; aPos0[i0++] = base.y * R; aPos0[i0++] = base.z * R
            }
            if (m < lineLength - 1) { indices[ii++] = vb; indices[ii++] = vb + 1; indices[ii++] = vb + 2; indices[ii++] = vb + 2; indices[ii++] = vb + 1; indices[ii++] = vb + 3 }
          }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('aPos', new THREE.BufferAttribute(aPos, 3)); geo.setAttribute('aPos0', new THREE.BufferAttribute(aPos0, 3)); geo.setAttribute('aWireRandom', new THREE.BufferAttribute(aRnd, 4))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))
        const mesh = new THREE.Mesh(geo, raysMat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh)
      }

      // Arched magma flares.
      const flaresMat = new THREE.ShaderMaterial({
        vertexShader: `attribute vec3 aPos; attribute vec3 aPos0; attribute vec3 aPos1; attribute vec4 aWireRandom;
          varying float vUVY; varying float vOpacity; varying vec3 vColor; varying vec3 vNormal;
          uniform float uWidth; uniform float uAmp; uniform float uTime; uniform float uNoiseFrequency; uniform float uNoiseAmplitude; uniform vec3 uCamPos; uniform mat4 uViewProjection; uniform float uOpacity; uniform float uHueSpread; uniform float uHue;
          #define m4 mat4( 0.00, 0.80, 0.60, -0.4, -0.80, 0.36, -0.48, -0.5, -0.60, -0.48, 0.64, 0.2, 0.40, 0.30, 0.20, 0.4)
          vec4 twistedSineNoise(vec4 q, float falloff){ float a = 1.0; float f = 1.0; vec4 sum = vec4(0.0);
            for (int i = 0; i < 4; i++) { q = m4 * q; vec4 s = sin(q.ywxz * f) * a; q += s; sum += s; a *= falloff; f /= falloff; } return sum; }
          vec3 getPosOBJ(float phase, float animPhase){ float size = distance(aPos0, aPos1); vec3 n = normalize((aPos0 + aPos1) * 0.5);
            vec3 p = mix(aPos0, aPos1, phase); float amp = sin(phase * 3.14159265) * size * uAmp; amp *= animPhase; p += n * amp;
            p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (amp * uNoiseAmplitude); return p; }
          #define hue(v) ( .6 + .6 * cos( 6.3*(v) + vec3(0.0,23.0,21.0) ) )
          void main(void){ vUVY = aPos.z; float animPhase = fract(uTime * 0.3 * (aWireRandom.y * 0.5) + aWireRandom.x);
            vec3 pOBJ = getPosOBJ(aPos.x, animPhase); vec3 p1OBJ = getPosOBJ(aPos.x + 0.01, animPhase);
            vec3 pW = (modelMatrix * vec4(pOBJ , 1.0)).xyz; vec3 p1W = (modelMatrix * vec4(p1OBJ, 1.0)).xyz;
            vec3 dirW = normalize(p1W - pW); vec3 vW = normalize(pW - uCamPos); vec3 sideW = normalize(cross(vW, dirW));
            float R = length(aPos0); float width = uWidth * aPos.z * (1.0 + animPhase) * R; pW += sideW * width; vNormal = normalize(pW);
            float lenW = length(pW); vOpacity = smoothstep(R, R * 1.03, lenW); vOpacity *= (1.0 - animPhase); vOpacity *= uOpacity;
            float front = dot(normalize(pW), normalize(uCamPos)); vOpacity *= 1.0 - smoothstep(0.35, 0.85, front);
            vColor = hue(aWireRandom.w * uHueSpread + uHue); gl_Position = uViewProjection * vec4(pW, 1.0); }`,
        fragmentShader: `uniform float uVisibility; uniform float uDirection; uniform vec3 uLightView;
          float getAlpha(vec3 n){ float nDotL = dot(n, uLightView) * uDirection; return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5); }
          varying float vUVY; varying float vOpacity; varying vec3 vColor; varying vec3 vNormal; uniform float uAlphaBlended;
          void main(void){ float alpha = smoothstep(1.0, 0.0, abs(vUVY)); alpha *= alpha; alpha *= vOpacity; alpha *= getAlpha(vNormal); gl_FragColor = vec4(vColor * alpha, alpha * uAlphaBlended); }`,
        transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
        uniforms: { uViewProjection: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uTime: { value: 0 }, uWidth: { value: 5e-3 }, uAmp: { value: 0.65 }, uOpacity: { value: 0.24 }, uAlphaBlended: { value: 0.65 }, uHueSpread: { value: 0.16 }, uHue: { value: 0 }, uNoiseFrequency: { value: 4 / SUN_SCALE }, uNoiseAmplitude: { value: 0.2 }, ...sunVisUniforms() },
      })
      {
        const lineCount = 2047, lineLength = 16, R = SUN_RADIUS * 0.995
        const totalVerts = lineCount * lineLength * 2
        const aPos = new Float32Array(totalVerts * 3), aPos0 = new Float32Array(totalVerts * 3), aPos1 = new Float32Array(totalVerts * 3), aRnd = new Float32Array(totalVerts * 4)
        const indices = new Uint32Array(lineCount * (lineLength - 1) * 6)
        const held = new THREE.Vector3(), dv = new THREE.Vector3(), f = new THREE.Vector3(), pv = new THREE.Vector3(), g = new THREE.Vector3()
        let s = 0, l = 0, c = 0, h = 0, u = 0, m0 = Math.random(), p0 = Math.random()
        for (let y = 0; y < lineCount; y++) {
          if (Math.random() < 0.025 || y === 0) {
            dv.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(); held.copy(dv)
            g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(0.4); held.add(g).normalize()
            m0 = Math.random(); p0 = Math.random()
          }
          f.copy(dv); g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(0.02); f.add(g).normalize()
          pv.copy(held); g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(0.075); pv.add(g).normalize()
          const rands = [m0, p0, Math.random(), Math.random()]
          for (let E = 0; E < lineLength; E++) {
            const vb = 2 * (y * lineLength + E)
            for (let A = 0; A <= 1; A++) {
              aPos[s++] = (E + 0.5) / lineLength; aPos[s++] = (y + 0.5) / lineCount; aPos[s++] = 2 * A - 1
              for (let t = 0; t < 4; t++) aRnd[l++] = rands[t]
              aPos0[c++] = f.x * R; aPos0[c++] = f.y * R; aPos0[c++] = f.z * R
              aPos1[h++] = pv.x * R; aPos1[h++] = pv.y * R; aPos1[h++] = pv.z * R
            }
            if (E < lineLength - 1) { indices[u++] = vb; indices[u++] = vb + 1; indices[u++] = vb + 2; indices[u++] = vb + 2; indices[u++] = vb + 1; indices[u++] = vb + 3 }
          }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('aPos', new THREE.BufferAttribute(aPos, 3)); geo.setAttribute('aPos0', new THREE.BufferAttribute(aPos0, 3)); geo.setAttribute('aPos1', new THREE.BufferAttribute(aPos1, 3)); geo.setAttribute('aWireRandom', new THREE.BufferAttribute(aRnd, 4))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))
        const mesh = new THREE.Mesh(geo, flaresMat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh)
      }

      // Per-frame Sun update: bake cube + feed camera uniforms into each pass.
      const _sunView = new THREE.Matrix4(), _sunVP = new THREE.Matrix4(), _sunCamUp = new THREE.Vector3(), _sunCamPos = new THREE.Vector3()
      const _sunNDC = new THREE.Vector3(), _flareDir = new THREE.Vector3()
      const ECL_OFFSETS: [number, number][] = [[0, 0], [0.75, 0], [0.53, 0.53], [0, 0.75], [-0.53, 0.53], [-0.75, 0], [-0.53, -0.53], [0, -0.75], [0.53, -0.53]]
      const _eclR = new THREE.Vector3(), _eclU = new THREE.Vector3(), _eclT = new THREE.Vector3()
      const flareRay = new THREE.Raycaster()
      let flareVis = 1, eclVis = 0, lastOccluder: THREE.Object3D | null = null

      function updateSunFX() {
        const t = sunUniforms.time.value
        perlinMat.uniforms.uTime.value = t * 0.1
        sunCubeCam.update(renderer, perlinScene)
        sunMaterial.uniforms.uTime.value = t * 0.055
        camera.updateMatrixWorld(true)
        _sunView.copy(camera.matrixWorld).invert()
        _sunVP.multiplyMatrices(camera.projectionMatrix, _sunView)
        _sunCamUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize()
        camera.getWorldPosition(_sunCamPos)
        glowMat.uniforms.uViewProjection.value.copy(_sunVP)
        glowMat.uniforms.uCamUp.value.copy(_sunCamUp)
        glowMat.uniforms.uCamPos.value.copy(_sunCamPos)
        for (const m of [raysMat, flaresMat]) { m.uniforms.uViewProjection.value.copy(_sunVP); m.uniforms.uCamPos.value.copy(_sunCamPos); m.uniforms.uTime.value = t }

        _sunNDC.set(0, 0, 0).project(camera)
        const behind = _sunNDC.z > 1
        const dSun = _sunCamPos.length()
        const pxF = H / (2 * Math.tan(deg(camera.fov / 2)))
        const sunPx = SUN_RADIUS / Math.max(dSun, 1) * pxF
        let visTarget = 0, seenFrac = 1
        if (!behind) {
          const meshes = selectables.filter(s => !s.sun).map(s => s.mesh)
          _eclR.setFromMatrixColumn(camera.matrixWorld, 0); _eclU.setFromMatrixColumn(camera.matrixWorld, 1)
          let seen = 0
          for (const [ox, oy] of ECL_OFFSETS) {
            _eclT.set(0, 0, 0).addScaledVector(_eclR, ox * SUN_RADIUS * 0.75).addScaledVector(_eclU, oy * SUN_RADIUS * 0.75)
            _flareDir.copy(_eclT).sub(_sunCamPos)
            const dist = _flareDir.length()
            flareRay.set(_sunCamPos, _flareDir.normalize()); flareRay.far = Math.max(dist - SUN_RADIUS, 0.1)
            if (flareRay.intersectObjects(meshes, false).length === 0) seen++
          }
          seenFrac = seen / ECL_OFFSETS.length; visTarget = Math.sqrt(seenFrac)
        }
        if (!behind) {
          const HW = W / 2, HH = H / 2
          const sx = _sunNDC.x * HW, sy = _sunNDC.y * HH
          let domPen = 0, domMesh: THREE.Object3D | null = null
          for (const sSel of selectables) {
            if (sSel.sun) continue
            sSel.mesh.getWorldPosition(_eclT)
            const dBody = _eclT.distanceTo(camera.position)
            if (dBody >= dSun) continue
            _eclT.project(camera); if (_eclT.z > 1) continue
            const bPx = sSel.rad / Math.max(dBody, 0.1) * pxF
            const sep = Math.hypot(_eclT.x * HW - sx, _eclT.y * HH - sy)
            const pen = (sunPx + bPx - sep) / (2 * sunPx)
            if (pen > domPen) { domPen = pen; domMesh = sSel.mesh }
          }
          if (domMesh) lastOccluder = domMesh
        }
        flareVis += (visTarget - flareVis) * 0.2
        const eclTarget = (!behind && lastOccluder) ? 1 - THREE.MathUtils.smoothstep(seenFrac, 0.02, 0.22) : 0
        eclVis += (eclTarget - eclVis) * 0.08

        const closeFade = flareParams.nearFade + (1 - flareParams.nearFade) * THREE.MathUtils.smoothstep(dSun, 18, 90)
        const farOpacity = 0.30 + 0.70 * THREE.MathUtils.clamp(sunPx / 80, 0, 1)
        const farSize = 0.15 + 0.85 * THREE.MathUtils.clamp(sunPx / 150, 0, 1)
        const starProp = Math.min(sunPx / 150, 1)
        const strandFade = 0.3 + 0.7 * THREE.MathUtils.clamp(sunPx / 90, 0, 1)
        raysMat.uniforms.uOpacity.value = 0.05 * strandFade
        flaresMat.uniforms.uOpacity.value = 0.24 * strandFade
        glowMat.uniforms.uBrightness.value = 1.3 * (0.55 + 0.45 * THREE.MathUtils.clamp(sunPx / 90, 0, 1))
        const offAxis = Math.max(Math.abs(_sunNDC.x), Math.abs(_sunNDC.y))
        const borderFade = 1 - THREE.MathUtils.smoothstep(offAxis, 1.1, 1.7)
        const globalGain = closeFade * farOpacity * flareVis * borderFade * flareParams.brightness

        const rOff = Math.hypot(_sunNDC.x, _sunNDC.y)
        const ghostSpread = 0.33 + 0.14 * Math.min(rOff, 1)
        const ghostGain = THREE.MathUtils.smoothstep(rOff, 0.06, 0.2) * (1 - THREE.MathUtils.smoothstep(rOff, 0.55, 0.85))

        for (const el of flareElements) {
          const isGhost = el.kind === 'halo'
          const opacity = el.baseOpacity * globalGain * (isGhost ? ghostGain : 1)
          const show = !behind && opacity > 0.01
          el.mesh.visible = show
          if (!show) continue
          const dEff = isGhost ? el.d * ghostSpread : el.d
          const sizeMul = flareParams.size * (isGhost ? flareParams.halo : flareParams.star) * (isGhost ? farSize : starProp)
          let ghostKill = 1
          if (isGhost) {
            const halfW = el.px * sizeMul / 2
            const W2 = W / 2, H2 = H / 2
            const gx = _sunNDC.x * W2, gy = _sunNDC.y * H2
            const gln = Math.hypot(gx, gy) || 1
            const goff = sunPx * 1.6 + halfW + dEff * gln * 1.1
            const px2 = gx + gx / gln * goff, py2 = gy + gy / gln * goff
            el.mesh.position.set(px2 / W2, py2 / H2, 0)
            const edgeGap = Math.hypot(px2 - gx, py2 - gy) - halfW
            ghostKill = THREE.MathUtils.smoothstep(edgeGap, sunPx * 1.1, sunPx * 1.45)
          } else el.mesh.position.set(_sunNDC.x, _sunNDC.y, 0)
          el.mesh.scale.set(el.px * el.stretchX * sizeMul * 2 / W, el.px * el.stretchY * sizeMul * 2 / H, 1)
          el.mat.opacity = opacity * ghostKill
        }

        if (eclVis > 0.02 && lastOccluder) {
          const sBody = selectables.find(b => b.mesh === lastOccluder)
          const occRad = sBody ? sBody.rad : 1
          lastOccluder.getWorldPosition(_eclT)
          const dOcc = _eclT.distanceTo(camera.position)
          const occPx = occRad / Math.max(dOcc, 0.1) * pxF
          _flareDir.copy(_eclT).sub(camera.position).normalize()
          const dSpr = Math.min(dOcc + occRad * 2.5, dSun - SUN_RADIUS * 1.2)
          eclipseCorona.position.copy(camera.position).addScaledVector(_flareDir, dSpr)
          const w = (occPx * 2.06 / 0.28) * dSpr / pxF
          eclipseCorona.scale.set(w, w, 1); eclipseCorona.quaternion.copy(camera.quaternion)
          coronaMat.uniforms.uGain.value = 0.9 * eclVis * flareParams.brightness
          eclipseCorona.visible = true
        } else eclipseCorona.visible = false

        sunMaterial.uniforms.uCoreGain.value = THREE.MathUtils.smoothstep(dSun, 13, 120)
      }

      /* -------------------------------------------------------- lens flare
         Screen-space overlay drawn after the scene in an orthographic camera:
         no depth-buffer dependency. Occlusion by real raycast; additive glow +
         aigrette star + anamorphic streak at the Sun, chain of ghosts along the
         optical axis. */
      const flareParams = { size: 1, brightness: 1, star: 1, halo: 1, nearFade: 0.15 }
      const flareScene = new THREE.Scene()
      const flareCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      flareCam.position.z = 1
      interface FlareEl { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; px: number; d: number; baseOpacity: number; kind: string; stretchX: number; stretchY: number }
      const flareElements: FlareEl[] = []

      function makeStarburstTexture() {
        const S = 1024, cc = S / 2
        const cv = document.createElement('canvas'); cv.width = cv.height = S
        const ctx = cv.getContext('2d')!; ctx.globalCompositeOperation = 'lighter'
        const ray = (angle: number, len: number, width: number, alpha: number) => {
          ctx.save(); ctx.translate(cc, cc); ctx.rotate(angle); ctx.scale(len, width)
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
          g.addColorStop(0, `rgba(255,242,220,${alpha})`); g.addColorStop(0.35, `rgba(255,215,160,${alpha * 0.45})`); g.addColorStop(1, 'rgba(255,190,120,0)')
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore()
        }
        ray(0, cc * 0.17, cc * 0.17, 1); ray(0, cc * 0.38, cc * 0.38, 0.30); ray(0, cc * 0.99, cc * 0.020, 0.95); ray(0, cc * 0.60, cc * 0.050, 0.45); ray(Math.PI / 2, cc * 0.45, cc * 0.012, 0.35)
        const spikes: [number, number][] = [[0.12, 0.72], [0.38, 0.48], [0.62, 0.62], [0.95, 0.44], [1.28, 0.66], [1.72, 0.50], [2.05, 0.58], [2.42, 0.42], [2.78, 0.64]]
        for (const [a, l] of spikes) { ray(a, cc * l, cc * 0.008, 0.55); ray(a + Math.PI, cc * l * 0.85, cc * 0.008, 0.48) }
        return new THREE.CanvasTexture(cv)
      }
      function flareTexture(kind: string) {
        const w = kind === 'streak' ? 1024 : 256, h = kind === 'streak' ? 128 : 256
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')!
        if (kind === 'streak') {
          const g = ctx.createLinearGradient(0, 0, w, 0)
          g.addColorStop(0, 'rgba(255,220,170,0)'); g.addColorStop(0.5, 'rgba(255,240,215,0.95)'); g.addColorStop(1, 'rgba(255,220,170,0)')
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          for (let y = 0; y < h; y++) { const fy = Math.exp(-Math.pow((y - h / 2) / (h * 0.16), 2)); for (let x = 0; x < w; x++) img.data[(y * w + x) * 4 + 3] *= fy }
          ctx.putImageData(img, 0, 0)
        } else {
          const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
          if (kind === 'glow') { g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(0.25, 'rgba(255,200,120,0.55)'); g.addColorStop(0.6, 'rgba(255,150,60,0.16)'); g.addColorStop(1, 'rgba(255,120,40,0)') }
          else if (kind === 'disc') { g.addColorStop(0, 'rgba(255,235,200,0.9)'); g.addColorStop(0.75, 'rgba(255,225,180,0.35)'); g.addColorStop(1, 'rgba(255,220,170,0)') }
          else { g.addColorStop(0.55, 'rgba(255,230,195,0)'); g.addColorStop(0.78, 'rgba(255,235,205,0.25)'); g.addColorStop(0.9, 'rgba(255,240,215,0.9)'); g.addColorStop(1, 'rgba(255,230,195,0)') }
          ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
        }
        return new THREE.CanvasTexture(cv)
      }
      const addFlareEl = (tex: THREE.Texture, px: number, d: number, color: number, opacity: number, kind: string, stretchX = 1, stretchY = 1) => {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(color), opacity: 0 })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
        mesh.renderOrder = flareElements.length; flareScene.add(mesh)
        flareElements.push({ mesh, mat, px, d, baseOpacity: opacity, kind, stretchX, stretchY })
      }
      addFlareEl(flareTexture('glow'), 950, 0, 0xffd9a0, 0.6, 'star')
      addFlareEl(makeStarburstTexture(), 780, 0, 0xfff2d8, 0.95, 'star')
      addFlareEl(flareTexture('streak'), 1500, 0, 0xffe6c0, 0.75, 'star', 1, 0.13)
      addFlareEl(flareTexture('disc'), 90, 0.18, 0xffcc88, 0.5, 'halo')
      addFlareEl(flareTexture('ring'), 210, 0.35, 0xf2c084, 0.45, 'halo')
      addFlareEl(flareTexture('disc'), 55, 0.50, 0xffd9a0, 0.55, 'halo')
      addFlareEl(flareTexture('ring'), 330, 0.68, 0xe6b070, 0.4, 'halo')
      addFlareEl(flareTexture('disc'), 120, 0.86, 0xffc070, 0.45, 'halo')
      addFlareEl(flareTexture('ring'), 460, 1.06, 0xd9a060, 0.35, 'halo')

      // Total-eclipse corona: a shader-computed lighting billboard, depth-tested
      // so any body in front cuts it out. Limb sits at r = 0.28 of the quad.
      const coronaMat = new THREE.ShaderMaterial({
        uniforms: { uGain: { value: 0 }, uTime: sunUniforms.time },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uGain; uniform float uTime; varying vec2 vUv;
          void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float th = atan(p.y, p.x);
            float edge = smoothstep(0.265, 0.295, r); float fall = exp(-(r - 0.30) * 7.0);
            float streaks = 0.72 + 0.28 * (0.5 * sin(th * 7.0 + uTime * 0.05 + 1.7) + 0.3 * sin(th * 13.0 - uTime * 0.08 + 4.2) + 0.2 * sin(th * 3.0 + uTime * 0.03 + 0.5));
            float win = 1.0 - smoothstep(0.70, 0.95, r); float a = edge * fall * streaks * win * uGain;
            float warm = smoothstep(0.30, 0.85, r); vec3 col = vec3(1.0, 0.96 - warm * 0.41, 0.84 - warm * 0.65); gl_FragColor = vec4(col, a); }`,
        transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
      const eclipseCorona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coronaMat)
      eclipseCorona.visible = false; eclipseCorona.renderOrder = 5; scene.add(eclipseCorona)

      /* ---------------------------------------------- atmospheres & rings */
      const ATMOSPHERES: Record<string, { color: number; intensity: number; h: number }> = {
        'Vénus': { color: 0xe6c98a, intensity: 1.9, h: 1.028 }, 'Terre': { color: 0x6fa8ff, intensity: 1.00, h: 1.030 },
        'Mars': { color: 0xd8a27a, intensity: 0.30, h: 1.018 }, 'Jupiter': { color: 0xd8c0a0, intensity: 0.40, h: 1.015 },
        'Saturne': { color: 0xe8d8b0, intensity: 0.35, h: 1.015 }, 'Uranus': { color: 0xa8e0e8, intensity: 0.50, h: 1.020 }, 'Neptune': { color: 0x7090ff, intensity: 0.55, h: 1.022 },
      }
      function makeAtmosphere(rad: number, { color, intensity, h }: { color: number; intensity: number; h: number }) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uMuLimb: { value: Math.sqrt(1 - 1 / (h * h)) } },
          vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldN; varying vec3 vWorldPos;
            void main(){ vNormal = normalize(normalMatrix * normal); vWorldN = normalize(mat3(modelMatrix) * normal);
              vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; vec4 mv = viewMatrix * wp; vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uMuLimb; varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldN; varying vec3 vWorldPos;
            void main(){ float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
              float a = (mu < uMuLimb) ? pow(smoothstep(0.0, uMuLimb, mu), 1.6) : exp(-(mu - uMuLimb) * 7.0);
              float sun = clamp(dot(normalize(-vWorldPos), normalize(vWorldN)) + 0.08, 0.0, 1.0); float lit = pow(sun, 0.8);
              vec3 V = normalize(cameraPosition - vWorldPos); float back = pow(clamp(dot(normalize(-vWorldPos), -V), 0.0, 1.0), 24.0);
              float ringB = (mu < uMuLimb) ? pow(smoothstep(0.0, uMuLimb, mu), 1.2) : exp(-(mu - uMuLimb) * 40.0);
              vec3 col = mix(uColor, vec3(1.0, 0.72, 0.42), back); gl_FragColor = vec4(col, (a * lit + back * ringB * 1.6) * uI); }`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        })
        const shell = new THREE.Mesh(new THREE.SphereGeometry(rad * h, 64, 32), mat); shell.renderOrder = 1; return shell
      }
      function makeRingTexture(style: string, [r, g, b]: number[]) {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1
        const ctx = cv.getContext('2d')!; const img = ctx.createImageData(256, 1)
        let seed = style === 'narrow' ? 7 : 3
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
        const alpha = new Float32Array(256)
        if (style === 'narrow') { for (let k = 0; k < 11; k++) { const c = 15 + rand() * 225, w = 1 + rand() * 3, amp = 0.35 + rand() * 0.65; for (let x = 0; x < 256; x++) alpha[x] += amp * Math.exp(-((x - c) ** 2) / (2 * w * w)) } }
        else { for (let x = 0; x < 256; x++) { const t = x / 255; alpha[x] = Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(t * 40 + 3)) } }
        for (let x = 0; x < 256; x++) { const i = x * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.min(255, alpha[x] * 255) }
        ctx.putImageData(img, 0, 0); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex
      }
      function makeCoverageTexture(seed: number, threshold: number) {
        const Wc = 512, Hc = 256
        const cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc
        const ctx = cv.getContext('2d')!; const img = ctx.createImageData(Wc, Hc)
        const hash2 = (x: number, y: number) => { let hh = (x * 374761393 + y * 668265263 + seed * 144665) | 0; hh = ((hh ^ (hh >> 13)) * 1274126177) | 0; return ((hh ^ (hh >> 16)) >>> 0) / 4294967295 }
        const sm = (t: number) => t * t * (3 - 2 * t); const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
        const vn = (x: number, y: number, P: number) => { const xi = Math.floor(x), yi = Math.floor(y); const u = sm(x - xi), v = sm(y - yi); const a = hash2(xi % P, yi), b = hash2((xi + 1) % P, yi), cc = hash2(xi % P, yi + 1), dd = hash2((xi + 1) % P, yi + 1); return a + (b - a) * u + (cc - a) * v + (a - b - cc + dd) * u * v }
        for (let y = 0; y < Hc; y++) {
          const latAbs = Math.abs(y / Hc - 0.5) * 2
          const zone = 0.25 + 0.75 * Math.max(sm(clamp01((latAbs - 0.6) / 0.3)), 1 - sm(clamp01(latAbs / 0.4)))
          for (let x = 0; x < Wc; x++) { let v = 0, amp = 0.5, freq = 6; for (let o = 0; o < 4; o++) { v += amp * vn(x * freq / Wc, y * freq / Wc * 0.5, freq); amp *= 0.5; freq *= 2 }
            const cover = clamp01((v * zone - threshold) * 3); const i = (y * Wc + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = cover * 255; img.data[i + 3] = 255 }
        }
        ctx.putImageData(img, 0, 0); const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; return tex
      }

      /* ------------------------------------------ gas giants: moving gas */
      const gasTime = { value: 0 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function gasGiantMaterial(map: THREE.Texture | null, { jets, speed, swirl }: { jets: number; speed: number; swirl: number }) {
        const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mat.onBeforeCompile = (sh: any) => {
          sh.uniforms.uGasTime = gasTime
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uGasTime;
float gg_hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gg_noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(gg_hash(i), gg_hash(i+vec2(1.0,0.0)), u.x), mix(gg_hash(i+vec2(0.0,1.0)), gg_hash(i+vec2(1.0,1.0)), u.x), u.y); }`)
            .replace('#include <map_fragment>', `
{
  vec2 guv = vMapUv; float lat = (guv.y - 0.5) * 3.14159265;
  float jet = cos(lat * ${jets.toFixed(1)}) * exp(-lat*lat*1.1);
  guv.x += uGasTime * ${speed.toFixed(5)} * (0.4 + jet);
  float n1 = gg_noise(guv * 16.0 + vec2(uGasTime*0.010, 0.0));
  float n2 = gg_noise(guv * 16.0 + vec2(0.0, uGasTime*0.008));
  guv += (vec2(n1, n2) - 0.5) * ${swirl.toFixed(5)};
  vec4 sampledDiffuseColor = texture2D(map, guv); diffuseColor *= sampledDiffuseColor;
}`)
        }
        return mat
      }

      /* --------------------------------------------- volumetric layers */
      function makeNoise3DTexture(S = 48) {
        const data = new Uint8Array(S * S * S)
        const hash = (x: number, y: number, z: number) => { let hh = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; hh = ((hh ^ (hh >> 13)) * 1274126177) | 0; return ((hh ^ (hh >> 16)) >>> 0) / 4294967295 }
        const sm = (t: number) => t * t * (3 - 2 * t)
        const vnoise = (x: number, y: number, z: number, P: number) => {
          const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi); let res = 0
          for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) { const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w); res += wgt * hash((xi + dx) % P, (yi + dy) % P, (zi + dz) % P) }
          return res
        }
        let i = 0
        for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let val = 0, amp = 0.55, freq = 4; for (let o = 0; o < 4; o++) { val += amp * vnoise(x * freq / S, y * freq / S, z * freq / S, freq); amp *= 0.5; freq *= 2 } data[i++] = Math.max(0, Math.min(255, val * 255)) }
        const tex = new THREE.Data3DTexture(data, S, S, S); tex.format = THREE.RedFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.needsUpdate = true; return tex
      }
      const noise3DTex = makeNoise3DTexture()
      interface VolEntry { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }
      const volumetrics: VolEntry[] = []
      function makeVolumetricShell(rad: number, opts: { mode: number; r1: number; r2: number; density: number; map?: THREE.Texture | null; jets?: number; speed?: number; gain?: number; tint?: number; drift?: number; windMix?: number }): VolEntry {
        const { mode, r1, r2, density, map = null, jets = 0, speed = 0, gain = 2.0, tint = 0xffffff, drift = 0.06, windMix = 0 } = opts
        const mat = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3, defines: { VOL_MODE: mode },
          uniforms: {
            uCamPos: { value: new THREE.Vector3() }, uSunPos: { value: new THREE.Vector3() }, uTime: gasTime,
            uR1: { value: rad * r1 }, uR2: { value: rad * r2 }, uDensity: { value: density }, uJets: { value: jets }, uSpeed: { value: speed },
            uGain: { value: gain }, uTint: { value: new THREE.Color(tint) }, uDrift: { value: drift }, uWindMix: { value: windMix }, uMap: { value: map }, uNoise: { value: noise3DTex },
          },
          vertexShader: `out vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `precision highp float; precision highp sampler3D;
            uniform vec3 uCamPos, uSunPos, uTint; uniform float uTime, uR1, uR2, uDensity, uJets, uSpeed, uGain, uDrift, uWindMix; uniform sampler2D uMap; uniform sampler3D uNoise;
            in vec3 vPos; out vec4 fragColor;
            vec2 sphereHits(vec3 ro, vec3 rd, float R){ float b = dot(ro, rd); float c = dot(ro, ro) - R*R; float h = b*b - c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
            float densityAt(vec3 p, out vec3 tint){ tint = vec3(1.0); float r = length(p); float hgt = (r - uR1) / (uR2 - uR1); if (hgt < 0.0 || hgt > 1.0) return 0.0;
              vec3 n = p / r; float lat = asin(clamp(n.y, -1.0, 1.0));
              vec2 uv = vec2(fract(atan(n.z, -n.x) / 6.2831853), 1.0 - acos(clamp(n.y, -1.0, 1.0)) / 3.14159265);
              float noi = texture(uNoise, p * (2.2 / uR1) + vec3(uTime*0.002, 0.0, 0.0)).r * 0.65 + texture(uNoise, p * (6.5 / uR1) - vec3(0.0, uTime*0.003, 0.0)).r * 0.35;
            #if VOL_MODE == 0
              tint = uTint;
              float wind = cos(lat * 4.0) * 0.5 + 0.5 * cos(lat * 1.5); wind = mix(wind, 1.0, uWindMix);
              float T = 8.0; float drift = uDrift * T * wind; float ph1 = fract(uTime / T); float ph2 = fract(uTime / T + 0.5);
              float evo = texture(uNoise, n * 1.3 + vec3(uTime * 0.015, 0.0, uTime * 0.010)).r; vec2 warp = (vec2(noi, evo) - 0.5) * 0.02;
              float c1 = texture(uMap, vec2(fract(uv.x + (ph1 - 0.5) * drift), uv.y) + warp).r; float c2 = texture(uMap, vec2(fract(uv.x + (ph2 - 0.5) * drift), uv.y) + warp).r;
              float cover = mix(c2, c1, 1.0 - abs(2.0 * ph1 - 1.0)) * (0.70 + 0.90 * evo);
              float topH = 0.25 + 0.75 * clamp(cover * (0.6 + 0.5 * noi), 0.0, 1.0); if (hgt > topH) return 0.0; float hrel = hgt / topH;
              float shape = smoothstep(0.0, 0.10, hrel) * (1.0 - smoothstep(0.50, 1.0, hrel)); float base = smoothstep(0.05, 0.45, cover * (0.62 + 0.58 * noi));
              float noiHi = texture(uNoise, p * (14.0 / uR1) + vec3(uTime*0.003, uTime*0.004, 0.0)).r; return max(base * shape - (1.0 - noiHi) * hrel * hrel * 0.6, 0.0);
            #else
              float vert = smoothstep(0.0, 0.22, hgt) * (1.0 - smoothstep(0.55, 1.0, hgt));
              float jet = cos(lat * uJets) * exp(-lat * lat * 1.1); uv.x = fract(uv.x + uTime * uSpeed * (0.4 + jet) * (0.55 + 0.9 * hgt));
              tint = texture(uMap, uv).rgb * 1.35; float bands = 0.78 + 0.22 * cos(lat * uJets * 2.0 + noi * 3.0); return vert * bands * (0.3 + 0.7 * noi) * 0.38;
            #endif
            }
            void main(){ vec3 rd = normalize(vPos - uCamPos); vec2 outer = sphereHits(uCamPos, rd, uR2); float t0 = max(outer.x, 0.0); float t1 = outer.y;
              vec2 inner = sphereHits(uCamPos, rd, uR1); if (inner.x > 0.0) t1 = min(t1, inner.x); if (t1 <= t0) discard;
              const int STEPS = 20; float stepLen = (t1 - t0) / float(STEPS); float shadowLen = (uR2 - uR1) * 0.7; vec4 acc = vec4(0.0); vec3 tint, tint2;
              for (int i = 0; i < STEPS; i++) { vec3 p = uCamPos + rd * (t0 + (float(i) + 0.5) * stepLen); float d = densityAt(p, tint); if (d < 0.003) continue;
                vec3 L = normalize(uSunPos - p); float ds = densityAt(p + L * shadowLen, tint2); float light = 0.45 + 0.75 * exp(-ds * 2.0); float dRaw = dot(p / length(p), L);
                float day = 1.15 * pow(clamp(dRaw, 0.0, 1.0), 1.35); vec3 col = tint * light * day * uGain;
                float fwdS = pow(clamp(dot(rd, L), 0.0, 1.0), 12.0); float tS = -dot(p, L);
                if (tS > 0.0) { float dP = sqrt(max(dot(p, p) - tS * tS, 0.0)); fwdS *= smoothstep(uR1 * 0.985, uR1 * 1.01, dP); }
                col += tint * fwdS * (0.35 + 1.25 * exp(-ds * 1.5)) * uGain; float a = 1.0 - exp(-d * uDensity * stepLen);
              #if VOL_MODE == 1
                a *= 0.30 + 0.70 * min(day, 1.0);
              #endif
                acc.rgb += (1.0 - acc.a) * a * col; acc.a += (1.0 - acc.a) * a; if (acc.a > 0.95) break; }
              if (acc.a < 0.01) discard; vec3 c = acc.rgb / max(acc.a, 1e-4); c = c / (c + 0.55); c = pow(c, vec3(1.0 / 2.2)); float aOut = acc.a * 0.93; fragColor = vec4(c * aOut, aOut); }`,
          transparent: true, depthWrite: false, premultipliedAlpha: true,
        })
        const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(rad * r2, 48, 24), mat); shellMesh.renderOrder = 1
        const entry = { mesh: shellMesh, mat }; volumetrics.push(entry); return entry
      }

      /* -------------------------------------- cloud & ring cast shadows */
      const cloudShadowUpdates: { mesh: THREE.Object3D; vec: THREE.Vector3 }[] = []
      function addCloudShadows(mat: THREE.MeshStandardMaterial, cloudTex: THREE.Texture, mesh: THREE.Object3D, strength = 0.5, height = 0.04, drift = 0.06, windMix = 0, nightLights = false) {
        const sunObj = { value: new THREE.Vector3(1, 0, 0) }
        cloudShadowUpdates.push({ mesh, vec: sunObj.value })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mat.onBeforeCompile = (sh: any) => {
          sh.uniforms.uCloudMap = { value: cloudTex }; sh.uniforms.uSunObj = sunObj; sh.uniforms.uCloudTime = gasTime
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform sampler2D uCloudMap; uniform vec3 uSunObj; uniform float uCloudTime; varying vec3 vObjPos;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 n = normalize(vObjPos); vec3 L = normalize(uSunObj); float ndl = dot(n, L);
  if (ndl > 0.0) {
    vec3 pc = normalize(n + L * (${height.toFixed(3)} / max(ndl, 0.25)));
    vec2 cuv = vec2(fract(atan(pc.z, -pc.x) / 6.2831853), 1.0 - acos(clamp(pc.y, -1.0, 1.0)) / 3.14159265);
    float clat = asin(clamp(pc.y, -1.0, 1.0)); float wind = cos(clat * 4.0) * 0.5 + 0.5 * cos(clat * 1.5); wind = mix(wind, 1.0, ${windMix.toFixed(2)});
    float T = 8.0; float drift = ${drift.toFixed(3)} * T * wind; float ph1 = fract(uCloudTime / T); float ph2 = fract(uCloudTime / T + 0.5);
    float c1 = texture2D(uCloudMap, vec2(fract(cuv.x + (ph1 - 0.5) * drift), cuv.y)).r; float c2 = texture2D(uCloudMap, vec2(fract(cuv.x + (ph2 - 0.5) * drift), cuv.y)).r;
    float cov = mix(c2, c1, 1.0 - abs(2.0 * ph1 - 1.0)); float shade = smoothstep(0.15, 0.7, cov) * ${strength.toFixed(3)} * ndl; diffuseColor.rgb *= 1.0 - shade;
  }
}`)
          if (nightLights) {
            sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float dayN = dot(normalize(vObjPos), normalize(uSunObj)); totalEmissiveRadiance *= 1.0 - smoothstep(-0.15, 0.08, dayN); }`)
          }
        }
        mat.needsUpdate = true
      }
      function addRingShadow(mat: THREE.MeshBasicMaterial, ringsMesh: THREE.Object3D, planetRadius: number) {
        const sunObj = { value: new THREE.Vector3(1, 0, 0) }
        cloudShadowUpdates.push({ mesh: ringsMesh, vec: sunObj.value })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mat.onBeforeCompile = (sh: any) => {
          sh.uniforms.uSunObj = sunObj; sh.uniforms.uPlanetR = { value: planetRadius }
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uSunObj; uniform float uPlanetR; varying vec3 vObjPos;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 d = normalize(uSunObj - vObjPos); float tStar = -dot(vObjPos, d);
  if (tStar > 0.0) { float dPerp = sqrt(max(dot(vObjPos, vObjPos) - tStar * tStar, 0.0)); float shade = smoothstep(uPlanetR * 0.97, uPlanetR * 1.06, dPerp); diffuseColor.rgb *= 0.15 + 0.85 * shade; }
}`)
        }
        mat.needsUpdate = true
      }
      // Soft twilight terminator without moving the terminator itself.
      function softTerminator(mat: THREE.Material) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyMat = mat as any
        const prev = anyMat.onBeforeCompile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        anyMat.onBeforeCompile = (sh: any) => {
          if (prev) prev(sh)
          for (const pat of ['float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float dotNL = saturate( dot( geometry.normal, directLight.direction ) );'])
            sh.fragmentShader = sh.fragmentShader.replace(pat, 'float dotNL = pow( saturate( dot( geometryNormal, directLight.direction ) ), 0.72 );')
        }
        anyMat.needsUpdate = true
      }

      /* -------------------------------------------------------- planets */
      const orbitLines: THREE.Line[] = [], labelDivs: HTMLDivElement[] = [], selectables: Selectable[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bodies: any[] = []
      let beltMesh: THREE.InstancedMesh | null = null
      let prevOuterEdge = 0
      for (const p of PLANETS) {
        const rad = radScale(p.radius) * (p.sizeMul || 1)
        const extent = rad * Math.max(p.rings ? p.rings.outer : 1, p.moons ? Math.max(...p.moons.map(m => m.dist)) : 1, 1) + 2
        const dist = Math.max(sizeScale(p.au), prevOuterEdge + (p.gapBefore || 0) + extent + 4)
        prevOuterEdge = dist + extent
        const incl = deg(p.orbIncl || 0)

        const orbitGroup = new THREE.Group(); orbitGroup.rotation.x = incl; scene.add(orbitGroup)
        const carrier = new THREE.Group(); carrier.position.x = dist; orbitGroup.add(carrier)

        let material: THREE.Material
        const lodEntries: LodEntry[] = []
        if (p.earth) {
          const m = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0xffddaa), emissiveIntensity: 0.28, roughness: 0.85, metalness: 0 })
          lodEntries.push(lodTexture('8k_earth_daymap.jpg', {}, mapApplier(m as never, 'map')))
          lodEntries.push(lodTexture('8k_earth_nightmap.jpg', {}, mapApplier(m as never, 'emissiveMap')))
          material = m
        } else if (p.gas && p.name !== 'Vénus') {
          material = gasGiantMaterial(null, p.gas)
        } else {
          const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
          lodEntries.push(lodTexture(p.map!, {}, mapApplier(m as never, 'map')))
          material = m
        }

        const mesh = new THREE.Mesh(new THREE.SphereGeometry(rad, 64, 32), material)
        mesh.rotation.order = 'ZYX'; mesh.rotation.z = deg(p.tilt); carrier.add(mesh)

        const atmo = ATMOSPHERES[p.name]
        if (atmo) mesh.add(makeAtmosphere(rad, atmo))

        if (p.earth) {
          const cloudTex = loadMap(texUrl('8k_earth_clouds.jpg', 2048), { srgb: false, wrapX: true })
          const shell = makeVolumetricShell(rad, { mode: 0, r1: 1.005, r2: 1.035, density: 38, gain: 1.9, map: cloudTex })
          mesh.add(shell.mesh)
          addCloudShadows(material as THREE.MeshStandardMaterial, cloudTex, mesh, 0.5, 0.04, 0.06, 0, true)
        } else if (p.name === 'Mars') {
          const covTex = makeCoverageTexture(11, 0.28)
          const shell = makeVolumetricShell(rad, { mode: 0, r1: 1.004, r2: 1.045, density: 48, gain: 2.0, tint: 0xf2e6da, map: covTex })
          mesh.add(shell.mesh)
          addCloudShadows(material as THREE.MeshStandardMaterial, covTex, mesh, 0.35, 0.03)
        } else if (p.gas && p.name !== 'Vénus') {
          const shell = makeVolumetricShell(rad, { mode: 1, r1: 1.0, r2: 1.028, density: 7, gain: 1.6, jets: p.gas.jets, speed: p.gas.speed * 10 })
          mesh.add(shell.mesh)
          lodEntries.push(lodTexture(p.map!, { wrapX: true }, t => { mapApplier(material as never, 'map')(t); shell.mat.uniforms.uMap.value = t }))
        }

        softTerminator(material)

        if (p.rings) {
          const R = p.rings; const inner = rad * R.inner, outer = rad * R.outer
          const geo = new THREE.RingGeometry(inner, outer, 128, 1)
          const uv = geo.attributes.uv, posA = geo.attributes.position
          for (let i = 0; i < uv.count; i++) { const x = posA.getX(i), y = posA.getY(i); uv.setXY(i, (Math.hypot(x, y) - inner) / (outer - inner), 0.5) }
          const ringMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: R.opacity ?? 1 })
          if (R.texture) lodEntries.push(lodTexture(R.texture, {}, mapApplier(ringMat as never, 'map')))
          else ringMat.map = makeRingTexture(R.style!, R.color!)
          const rings = new THREE.Mesh(geo, ringMat); rings.rotation.x = Math.PI / 2; rings.renderOrder = 1; mesh.add(rings)
          addRingShadow(ringMat, rings, rad)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const moonPivots: any[] = []
        if (p.moons) {
          const anchor = new THREE.Group(); anchor.rotation.z = deg(p.tilt); carrier.add(anchor)
          for (const m of p.moons) {
            const mPivot = new THREE.Group(); mPivot.rotation.y = Math.random() * Math.PI * 2; anchor.add(mPivot)
            const visRad = 0.10 + Math.pow(m.km / 2634, 0.6) * 0.38
            const mEntries: LodEntry[] = []
            let mMat: THREE.MeshStandardMaterial
            if (m.tex) {
              mMat = new THREE.MeshStandardMaterial({ roughness: 1 })
              mEntries.push(lodTexture(m.tex, {}, mapApplier(mMat as never, 'map')))
              if (m.bump) { mMat.bumpMap = loadMap(texUrl(m.bump, 1024), { srgb: false }); mMat.bumpScale = 0.015 }
              if (m.normal) { mMat.normalMap = loadMap(texUrl(m.normal, 1024), { srgb: false }); mMat.normalScale = new THREE.Vector2(0.7, 0.7) }
            } else {
              mMat = new THREE.MeshStandardMaterial({ color: m.tint, roughness: 1 })
              mEntries.push(lodTexture('8k_moon.jpg', {}, mapApplier(mMat as never, 'map')))
            }
            softTerminator(mMat)
            const mMesh = new THREE.Mesh(new THREE.SphereGeometry(visRad, 48, 24), mMat); mMesh.position.x = rad * m.dist; mPivot.add(mMesh)
            if (m.name === 'Titan') mMesh.add(makeAtmosphere(visRad, { color: 0xd8a050, intensity: 0.9, h: 1.09 }))
            moonPivots.push({ pivot: mPivot, period: m.period })
            lodBodies.push({ mesh: mMesh, rad: visRad, entries: mEntries })
            selectables.push({ name: m.name, mesh: mMesh, rad: visRad, moon: true, info: m.info })
          }
        }

        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist)) }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4a5a8a, transparent: true, opacity: 0.4 }))
        line.visible = ui.showOrbits; orbitGroup.add(line); orbitLines.push(line)

        const div = document.createElement('div')
        div.className = 'cosmos-label'; div.textContent = p.name
        div.style.display = ui.showLabels ? '' : 'none'
        labelHost!.appendChild(div); labelDivs.push(div)

        lodBodies.push({ mesh, rad, entries: lodEntries })
        const body = { ...p, carrier, mesh, moonPivots, dist, rad, angle: Math.random() * Math.PI * 2 }
        bodies.push(body)
        selectables.push({ name: p.name, mesh, rad, info: p.info, au: p.au, period: p.period, radius: p.radius })
      }

      const sunBody: Selectable = { name: 'Soleil', mesh: sun, rad: SUN_RADIUS, sun: true, info: 'Notre étoile, une naine jaune de type G2V âgée de 4,6 milliards d\'années. Elle concentre 99,86 % de la masse du système solaire.' }
      selectables.push(sunBody)

      /* asteroid belt (between Mars and Jupiter) */
      {
        const N = 1600
        const marsB = bodies.find(b => b.name === 'Mars'), jupB = bodies.find(b => b.name === 'Jupiter')
        const inner = marsB.dist + marsB.rad * 3.5 + 5
        const outer = Math.min(jupB.dist - (jupB.rad * 3.8 + 6), inner + 32)
        const geo = new THREE.IcosahedronGeometry(0.12, 0)
        const mat = new THREE.MeshStandardMaterial({ color: 0x8a8078, roughness: 1 })
        const belt = new THREE.InstancedMesh(geo, mat, N)
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3()
        for (let i = 0; i < N; i++) {
          const a = Math.random() * Math.PI * 2, r = inner + Math.random() * (outer - inner)
          q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)); s.setScalar(0.4 + Math.random() * 1.4)
          m.compose(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 1.6, Math.sin(a) * r), q, s); belt.setMatrixAt(i, m)
        }
        scene.add(belt); beltMesh = belt
      }

      /* --------------------------------------------------- interaction */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let followed: any = null
      const statsOf = (b: Selectable): string => b.sun ? 'Rayon : 109 R⊕ · Température de surface : 5 500 °C' : b.moon ? 'Satellite naturel' : `Distance : ${b.au} UA · Année : ${Math.round(b.period ?? 0)} j · Rayon : ${b.radius} R⊕`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function setFollow(body: any) {
        followed = body
        if (body && body === hovered) setHovered(null)
        if (body) {
          const worldId = WORLD_OF[body.name]
          setSelected({ name: body.name, info: body.info, stats: statsOf(body), worldId })
        } else { setSelected(null); controls.target.set(0, 0, 0) }
      }

      const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
      let downPos: [number, number] | null = null, isPointerDown = false
      const rectOf = () => renderer.domElement.getBoundingClientRect()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function pickBody(cx: number, cy: number): any {
        const rect = rectOf()
        pointer.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const hits = raycaster.intersectObjects(selectables.map(b => b.mesh), true)
        for (const hit of hits) { let obj: THREE.Object3D | null = hit.object; while (obj) { const found = selectables.find(b => b.mesh === obj); if (found) return found; obj = obj.parent } }
        return null
      }

      // Hover outline + 5 s freeze so the body can be double-clicked in place.
      const outlineMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false }))
      outlineMesh.visible = false; outlineMesh.renderOrder = 2; scene.add(outlineMesh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let hovered: any = null, hoverFreezeUntil = 0
      const lastMove = { x: -1, y: -1 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function setHovered(b: any) {
        if (b === hovered) return
        hovered = b
        if (outlineMesh.parent) outlineMesh.parent.remove(outlineMesh)
        if (b) { outlineMesh.scale.setScalar(b.rad * 1.07); b.mesh.add(outlineMesh); outlineMesh.visible = true; hoverFreezeUntil = performance.now() + 5000; renderer.domElement.style.cursor = 'pointer' }
        else { outlineMesh.visible = false; hoverFreezeUntil = 0; renderer.domElement.style.cursor = '' }
      }
      function refreshHover() { if (isPointerDown || lastMove.x < 0) return; const b = pickBody(lastMove.x, lastMove.y); setHovered(b && b !== followed ? b : null) }
      let hoverThrottle = 0
      const onPointerMove = (e: PointerEvent) => { lastMove.x = e.clientX; lastMove.y = e.clientY; const now = performance.now(); if (now - hoverThrottle < 80) return; hoverThrottle = now; refreshHover() }
      const onPointerLeave = () => setHovered(null)
      renderer.domElement.addEventListener('pointermove', onPointerMove)
      renderer.domElement.addEventListener('pointerleave', onPointerLeave)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let zoomAnim: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function startZoom(body: any) { setFollow(body); zoomAnim = { body, dist: Math.max(body.rad * 3.2, 2.2) }; controls.enableDamping = false }
      function cancelZoom() { zoomAnim = null; controls.enableDamping = true }

      let lastTap = { time: 0, x: 0, y: 0 }
      const onPointerDown = (e: PointerEvent) => { downPos = [e.clientX, e.clientY]; isPointerDown = true }
      const onPointerUp = (e: PointerEvent) => {
        isPointerDown = false
        if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5) return
        const now = performance.now()
        const isDouble = now - lastTap.time < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 8
        lastTap = { time: now, x: e.clientX, y: e.clientY }
        const b = pickBody(e.clientX, e.clientY); if (!b) return
        if (isDouble) startZoom(b); else setFollow(b)
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown)
      renderer.domElement.addEventListener('pointerup', onPointerUp)
      controls.addEventListener('start', cancelZoom)

      /* ------------------------------------------------------ controls API */
      ctlRef.current = {
        setPaused: b => { ui.paused = b },
        setSpeed01: v => { ui.speed01 = v },
        setShowOrbits: b => { ui.showOrbits = b; orbitLines.forEach(l => l.visible = b) },
        setShowLabels: b => { ui.showLabels = b; labelDivs.forEach(d => d.style.display = b ? '' : 'none') },
        setShowConst: b => { ui.showConst = b; if (constellationLines) constellationLines.visible = b },
        setFlare: (key, val) => { (flareParams as Record<string, number>)[key] = val / 100 },
        follow: name => { if (!name) { cancelZoom(); setFollow(null); return } const b = selectables.find(s => s.name === name); if (b) { if (followed === b) { cancelZoom(); setFollow(null) } else startZoom(b) } },
        resetView: () => { cancelZoom(); setFollow(null) },
      }

      /* ---------------------------------------------------------- animation */
      const worldPos = new THREE.Vector3(), _volA = new THREE.Vector3(), _volB = new THREE.Vector3()
      const clock = new THREE.Clock()
      let raf = 0, lodClock = 0

      function animate() {
        raf = requestAnimationFrame(animate)
        const dt = Math.min(clock.getDelta(), 0.1)
        const daysPerSec = speedFrom01(ui.speed01)
        const frozen = performance.now() < hoverFreezeUntil

        if (!ui.paused && !frozen) {
          simDays += daysPerSec * dt
          if (daysRef.current) daysRef.current.textContent = simDays < 10 ? simDays.toFixed(1).replace('.', ',') : Math.floor(simDays).toLocaleString('fr-FR')
          for (const b of bodies) {
            b.angle += (2 * Math.PI / b.period) * daysPerSec * dt
            b.carrier.position.set(Math.cos(b.angle) * b.dist, 0, -Math.sin(b.angle) * b.dist)
            b.mesh.rotation.y += (2 * Math.PI / b.day) * daysPerSec * dt
            for (const m of b.moonPivots) m.pivot.rotation.y += (2 * Math.PI / m.period) * daysPerSec * dt
          }
          gasTime.value += daysPerSec * dt
          sun.rotation.y += 0.02 * dt
          if (beltMesh) beltMesh.rotation.y += 0.008 * daysPerSec * dt * 0.05
        }
        sunUniforms.time.value += dt

        if (followed) {
          followed.mesh.getWorldPosition(worldPos)
          controls.target.lerp(worldPos, 0.12)
          const minD = followed.rad * 2.5
          if (camera.position.distanceTo(worldPos) < minD) camera.position.sub(worldPos).setLength(minD).add(worldPos)
        }
        if (zoomAnim) {
          zoomAnim.body.mesh.getWorldPosition(worldPos)
          const desired = camera.position.clone().sub(worldPos).setLength(zoomAnim.dist).add(worldPos)
          camera.position.lerp(desired, 0.09); controls.target.lerp(worldPos, 0.15)
          if (camera.position.distanceTo(desired) < 0.25) cancelZoom()
        }
        controls.update()

        lodClock += dt
        if (lodClock > 0.5) { lodClock = 0; updateLODs(); refreshHover() }

        for (const v of volumetrics) {
          v.mesh.updateWorldMatrix(true, false)
          v.mat.uniforms.uCamPos.value.copy(v.mesh.worldToLocal(_volA.copy(camera.position)))
          v.mat.uniforms.uSunPos.value.copy(v.mesh.worldToLocal(_volB.set(0, 0, 0)))
        }
        for (const s of cloudShadowUpdates) { s.mesh.updateWorldMatrix(true, false); s.vec.copy(s.mesh.worldToLocal(_volB.set(0, 0, 0))) }

        bodies.forEach((b, i) => {
          b.mesh.getWorldPosition(worldPos)
          const sp = worldPos.clone().project(camera)
          const div = labelDivs[i]
          const behind = sp.z > 1
          div.style.visibility = behind ? 'hidden' : 'visible'
          if (!behind) { div.style.left = ((sp.x * 0.5 + 0.5) * W) + 'px'; div.style.top = ((-sp.y * 0.5 + 0.5) * H) + 'px' }
        })

        updateSunFX()
        renderer.render(scene, camera)
        renderer.autoClear = false; renderer.render(flareScene, flareCam); renderer.autoClear = true
      }
      let simDays = 0

      // Start on the body matching the current 2D world (continuity from map).
      const startName = BODY_OF[currentId] ?? 'Terre'
      const startBody = selectables.find(s => s.name === startName) ?? selectables.find(s => s.name === 'Terre')
      if (startBody) startZoom(startBody)
      animate()

      const onResize = () => { W = mount!.clientWidth || W; H = mount!.clientHeight || H; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H) }
      window.addEventListener('resize', onResize)

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        renderer.domElement.removeEventListener('pointermove', onPointerMove)
        renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
        renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer.domElement.removeEventListener('pointerup', onPointerUp)
        controls.dispose()
        labelDivs.forEach(d => d.remove())
        sunCubeRT.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        if (renderer.domElement.parentNode === mount) mount!.removeChild(renderer.domElement)
        ctlRef.current = null
      }
    }

    return () => { cancelled = true; dispose() }
    // Rebuild only when the starting world changes; callbacks come via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // --- overlay handlers (sync React state + the live uiRef via ctlRef) ---
  const onSpeed = (v: number) => { setSpeed01(v); ctlRef.current?.setSpeed01(v) }
  const togglePause = () => { const b = !paused; setPaused(b); ctlRef.current?.setPaused(b) }
  const onOrbits = (b: boolean) => { setShowOrbits(b); ctlRef.current?.setShowOrbits(b) }
  const onLabels = (b: boolean) => { setShowLabels(b); ctlRef.current?.setShowLabels(b) }
  const onConst = (b: boolean) => { setShowConst(b); ctlRef.current?.setShowConst(b) }
  const onFlare = (key: keyof typeof flare, val: number) => { setFlare(f => ({ ...f, [key]: val })); ctlRef.current?.setFlare(key, val) }
  const travelWorld = selected?.worldId ? worldById(selected.worldId) : undefined

  const panel: React.CSSProperties = { background: 'rgba(10,14,26,0.78)', backdropFilter: 'blur(8px)', border: '1px solid rgba(120,160,255,0.25)', borderRadius: 12, color: '#cdd8f5' }
  const btn: React.CSSProperties = { background: 'rgba(109,158,255,0.15)', color: '#cdd8f5', border: '1px solid rgba(109,158,255,0.4)', borderRadius: 7, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }

  return (
    <div className="absolute inset-0 z-[1250] no-print" style={{ background: '#04060e' }}>
      <div ref={mountRef} className="w-full h-full" />
      <div ref={labelsRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }} />

      {webglError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#9fb0d8', padding: 24, zIndex: 8 }}>
          <div>
            <Telescope size={32} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 15, color: '#fff', marginBottom: 6 }}>Système solaire 3D indisponible</div>
            <div style={{ fontSize: 12 }}>Votre navigateur n'expose pas WebGL (accélération graphique désactivée).</div>
          </div>
        </div>
      )}

      {/* Control panel (top-left) */}
      <div style={{ ...panel, position: 'absolute', top: 16, left: 16, zIndex: 10, padding: '16px 18px', width: 250, userSelect: 'none' }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1, color: '#fff' }}>SYSTÈME SOLAIRE</div>
        <div style={{ fontSize: 11, color: '#7f8db0', marginBottom: 12 }}>Simulation 3D — échelles compressées</div>

        <label style={{ fontSize: 12, color: '#9fb0d8', display: 'block' }}>Vitesse : {formatSpeed(speedFrom01(speed01))} / seconde</label>
        <input type="range" min={0} max={100} step={1} value={speed01 * 100} onChange={e => onSpeed(+e.target.value / 100)} style={{ width: '100%', accentColor: '#6d9eff', marginTop: 4 }} />

        <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={showOrbits} onChange={e => onOrbits(e.target.checked)} /> Orbites</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={showLabels} onChange={e => onLabels(e.target.checked)} /> Noms</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={showConst} onChange={e => onConst(e.target.checked)} /> Constell.</label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={{ ...btn, flex: 1 }} onClick={togglePause}>{paused ? '▶ Reprendre' : '⏸ Pause'}</button>
          <button style={{ ...btn, flex: 1 }} onClick={() => { ctlRef.current?.resetView() }}>⟲ Vue globale</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
          {PLANET_NAMES.map(n => (
            <button key={n} onClick={() => ctlRef.current?.follow(n)}
              style={{ ...btn, fontSize: 11, padding: '5px 0', ...(selected?.name === n ? { background: 'rgba(109,158,255,0.5)', color: '#fff' } : {}) }}>{n}</button>
          ))}
        </div>

        <details style={{ marginTop: 12, borderTop: '1px solid rgba(120,160,255,0.15)', paddingTop: 8 }} open={flareOpen} onToggle={e => setFlareOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#9fb0d8', userSelect: 'none' }}>Lens flare</summary>
          {([['size', 'Taille globale', 300], ['brightness', 'Brillance', 250], ['star', 'Étoile centrale', 300], ['halo', 'Halo / fantômes', 300], ['nearFade', 'Effet minimal de près', 100]] as [keyof typeof flare, string, number][]).map(([key, label, max]) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: '#9fb0d8', display: 'block', marginTop: 8 }}>{label} : {flare[key]} %</label>
              <input type="range" min={0} max={max} step={5} value={flare[key]} onChange={e => onFlare(key, +e.target.value)} style={{ width: '100%', accentColor: '#6d9eff', marginTop: 4 }} />
            </div>
          ))}
        </details>

        <div style={{ marginTop: 12, fontSize: 11, color: '#7f8db0' }}>Temps simulé : <b ref={daysRef} style={{ color: '#cdd8f5', fontWeight: 600 }}>0</b> jours</div>
      </div>

      {/* Selected body info (bottom-left) */}
      {selected && (
        <div style={{ ...panel, position: 'absolute', bottom: 16, left: 16, zIndex: 10, padding: '12px 16px', maxWidth: 320, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 4, fontWeight: 600 }}>{selected.name}</div>
          {selected.info}<br />
          <span style={{ color: '#7f8db0' }}>{selected.stats}<span ref={lodRef} /></span>
          {travelWorld && (
            <button onClick={() => onTravelRef.current(travelWorld)}
              style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, width: '100%', justifyContent: 'center' }}>
              <MapPin size={13} /> Explorer la carte
            </button>
          )}
        </div>
      )}

      {/* Title + hint (top-center) */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: 13, background: 'rgba(0,0,0,0.35)', borderRadius: 999, padding: '6px 16px', pointerEvents: 'none', zIndex: 10 }}>
        <Telescope size={15} /> Système solaire 3D · glisser/molette · clic = suivre · double-clic = zoomer
      </div>

      <button onClick={onClose} className="hover:bg-white/20" style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, border: 'none', cursor: 'pointer' }} aria-label="Fermer">
        <X size={20} />
      </button>
    </div>
  )
}
