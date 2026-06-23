import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { X, Telescope } from 'lucide-react'
import { WORLDS, realLongitudeDeg, EARTH_CLOUDS, bodySize, bodyOrbit, satSize, satDist, type World } from './worlds'

const DEG = Math.PI / 180

// Dégradé radial → halo/éruptions. `warm` = teinte (true: orangé chaud).
function radialTexture(stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(([o, col]) => g.addColorStop(o, col))
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
const glowTexture = () => radialTexture([[0, 'rgba(255,235,170,0.95)'], [0.28, 'rgba(255,180,60,0.45)'], [1, 'rgba(255,150,30,0)']])

// Surface solaire en SHADER : plasma turbulent (bruit simplex fbm) → granulation
// animée orange/jaune/blanc, façon Solar System Scope. Pas de texture externe.
const SUN_GLSL_NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<5;i++){ f+=a*snoise(p); p*=2.0; a*=0.5; } return f; }
`
function sunShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vPos; varying vec3 vNV; void main(){ vPos=position; vNV=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: SUN_GLSL_NOISE + `
      varying vec3 vPos; varying vec3 vNV; uniform float uTime;
      void main(){
        vec3 p=normalize(vPos);
        float n=0.5+0.5*fbm(p*4.5+vec3(0.0,uTime*0.05,0.0));
        float d=0.5+0.5*fbm(p*11.0-vec3(uTime*0.08));
        float v=clamp(n*0.7+d*0.5,0.0,1.0);
        // rampe plus jaune et lumineuse (cœur blanc-jaune, sillons orange)
        vec3 col=mix(vec3(0.75,0.2,0.0),vec3(1.0,0.5,0.04),smoothstep(0.2,0.44,v));
        col=mix(col,vec3(1.0,0.82,0.22),smoothstep(0.44,0.66,v));
        col=mix(col,vec3(1.0,0.95,0.6),smoothstep(0.66,0.84,v));
        col=mix(col,vec3(1.0,1.0,0.92),smoothstep(0.86,0.98,v));
        // bloom central : le centre du disque (face caméra) brille davantage
        float facing=clamp(vNV.z,0.0,1.0);
        col+=vec3(1.0,0.95,0.78)*pow(facing,2.6)*(0.45+0.25*v);
        gl_FragColor=vec4(col*1.12,1.0);
      }`,
  })
}

// Couronne = sprite (face caméra) dont le dégradé est BRILLANT au ras du Soleil
// puis s'estompe vers l'extérieur (transparent au centre, là où le disque solaire
// le recouvre). Le pic de luminosité est calé sur le bord du Soleil.
const coronaRingTexture = () => radialTexture([
  [0.00, 'rgba(255,222,95,0)'],
  [0.74, 'rgba(255,222,95,0)'],
  [0.82, 'rgba(255,228,120,0.95)'],
  [0.88, 'rgba(255,195,70,0.45)'],
  [1.00, 'rgba(255,170,40,0)'],
])

interface SunFx { corona: THREE.Sprite; sunSize: number; uniforms: { uTime: { value: number } } }

// Atmosphère planétaire : dégradé blanc (tinté par la couleur de la planète),
// BRILLANT au ras du limbe puis fondu vers l'extérieur (transparent au centre).
const atmosphereTexture = () => radialTexture([
  [0.00, 'rgba(255,255,255,0)'],
  [0.70, 'rgba(255,255,255,0)'],
  [0.80, 'rgba(255,255,255,0.9)'],
  [0.90, 'rgba(255,255,255,0.35)'],
  [1.00, 'rgba(255,255,255,0)'],
])

// Anneau dont la texture (bande radiale) est mappée selon le rayon.
function ringMesh(inner: number, outer: number, opts: { texture?: THREE.Texture; color?: number; opacity: number }): THREE.Mesh {
  const geo = new THREE.RingGeometry(inner, outer, 96, 1)
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  const mat = new THREE.MeshBasicMaterial({
    map: opts.texture ?? null, color: opts.color ?? 0xffffff,
    side: THREE.DoubleSide, transparent: true, opacity: opts.opacity, depthWrite: false,
  })
  if (opts.texture) opts.texture.wrapS = THREE.ClampToEdgeWrapping
  const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2
  return m
}

// Système solaire 3D réaliste : positions orbitales réelles (date courante),
// reliefs, nuages terrestres, anneaux (Saturne texturé, Jupiter/Uranus ténus),
// lunes, ceinture d'astéroïdes ; clic + zoom progressif vers Terre/Lune/Mars.
export function MapsCosmos3D({
  currentId, onTravel, onClose,
}: {
  currentId: string
  onTravel:  (w: World) => void
  onClose:   () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const real = false   // échelle stylisée (lisible) uniquement

  useEffect(() => {
    const mount = mountRef.current, labelHost = labelsRef.current
    if (!mount || !labelHost) return
    let W = mount.clientWidth || 800, H = mount.clientHeight || 600

    const scene = new THREE.Scene()
    // Échelle réelle : énorme amplitude de distances → near minuscule, far immense,
    // depth logarithmique pour éviter le z-fighting.
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 20000)
    camera.position.set(0, 900, 2400)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setClearColor(0x04060e, 1)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08
    controls.minDistance = 8; controls.maxDistance = 8000

    // Étoiles
    const sg = new THREE.BufferGeometry(); const N = 2200, sp = new Float32Array(N * 3)
    const starBase = 4500, starSpread = 9000
    for (let i = 0; i < N; i++) { const r = starBase + Math.random() * starSpread, th = Math.random() * 2 * Math.PI, ph = Math.acos(2 * Math.random() - 1); sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.cos(ph); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.85 })))

    scene.add(new THREE.AmbientLight(0x2b2f40, 1))
    scene.add(new THREE.PointLight(0xffffff, 3, 0, 0.25))

    const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous')
    const tex = (u: string) => { const t = loader.load(u); t.colorSpace = THREE.SRGBColorSpace; return t }

    interface Body { world: World; mesh: THREE.Mesh; pivot: THREE.Object3D; spin: number; revol: number; label: HTMLButtonElement; rsize: number }
    const bodies: Body[] = []
    const orbitNodes: Record<string, THREE.Object3D> = {}
    const moonPivots: { node: THREE.Object3D; speed: number; mesh: THREE.Mesh; label: HTMLDivElement }[] = []
    let clouds: THREE.Mesh | null = null
    let sunFx: SunFx | null = null
    const now = Date.now()

    WORLDS.forEach(w => {
      const sz = bodySize(w, real), orb = bodyOrbit(w, real)
      // Plan orbital incliné (Ω autour de Y, puis inclinaison autour de X) — chaque
      // planète dans son vrai axe de révolution ; les lunes restent sous leur parent.
      let host: THREE.Object3D = w.parent ? (orbitNodes[w.parent] ?? scene) : scene
      if (!w.parent && (w.incl || w.node)) {
        const plane = new THREE.Object3D(); plane.rotation.y = (w.node ?? 0) * DEG
        const inc = new THREE.Object3D(); inc.rotation.x = (w.incl ?? 0) * DEG; plane.add(inc)
        scene.add(plane); host = inc
      }

      // Révolution : pivot sous le plan orbital (ou sous la planète parente).
      const pivot = new THREE.Object3D()
      host.add(pivot)
      if (w.periodD && w.L0 != null && !w.parent) pivot.rotation.y = -realLongitudeDeg(w.L0, w.periodD, now) * DEG
      else pivot.rotation.y = Math.random() * Math.PI * 2

      const orbitNode = new THREE.Object3D(); orbitNode.position.x = orb; pivot.add(orbitNode)
      orbitNodes[w.id] = orbitNode

      // Anneau d'orbite (dans le plan orbital incliné).
      if (!w.parent && orb > 0) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(orb - 0.5, orb + 0.5, 256), new THREE.MeshBasicMaterial({ color: 0x3f4f70, side: THREE.DoubleSide, transparent: true, opacity: 0.3 }))
        ring.rotation.x = Math.PI / 2; host.add(ring)
      }

      // Inclinaison d'axe → sphère.
      const tiltGroup = new THREE.Object3D(); tiltGroup.rotation.z = (w.tilt ?? 0) * DEG; orbitNode.add(tiltGroup)
      const matOpts: THREE.MeshStandardMaterialParameters = { map: tex(w.texture), roughness: 1, metalness: 0 }
      if (w.bump) { matOpts.bumpMap = tex(w.bump); matOpts.bumpScale = 0.6 }
      const material: THREE.Material = w.id === 'sun' ? sunShaderMaterial() : new THREE.MeshStandardMaterial(matOpts)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(sz, 48, 48), material)
      mesh.userData.worldId = w.id; tiltGroup.add(mesh)

      if (w.id === 'sun') {
        // Couronne : anneau lumineux au ras du limbe, fondu vers l'extérieur.
        const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaRingTexture(), color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
        corona.scale.set(sz * 2.45, sz * 2.45, 1); mesh.add(corona)
        sunFx = { corona, sunSize: sz, uniforms: (material as THREE.ShaderMaterial).uniforms as { uTime: { value: number } } }
      }
      if (w.id === 'earth') {
        clouds = new THREE.Mesh(new THREE.SphereGeometry(sz * 1.02, 48, 48), new THREE.MeshStandardMaterial({ map: tex(EARTH_CLOUDS), transparent: true, opacity: 0.4, depthWrite: false }))
        mesh.add(clouds)
      }
      if (w.ring) mesh.add(ringMesh(sz * w.ring.inner, sz * w.ring.outer, { texture: w.ring.texture ? tex(w.ring.texture) : undefined, color: w.ring.color, opacity: w.ring.opacity }))
      if (w.atmosphere) {
        const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: atmosphereTexture(), color: w.atmosphere.color, transparent: true, opacity: Math.min(0.9, w.atmosphere.intensity), blending: THREE.AdditiveBlending, depthWrite: false }))
        const s2 = sz * 2.55 * (0.92 + (w.atmosphere.size - 1) * 1.2)   // anneau au ras du limbe
        atm.scale.set(s2, s2, 1); mesh.add(atm)
      }
      // Lunes décoratives (non cartographiées).
      ;(w.moons ?? []).forEach(s => {
        const mp = new THREE.Object3D(); mp.rotation.y = Math.random() * Math.PI * 2; orbitNode.add(mp)
        const mm = new THREE.Mesh(new THREE.SphereGeometry(satSize(s, real), 20, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 1 }))
        mm.position.x = satDist(s, real); mp.add(mm)
        const ml = document.createElement('div')
        ml.textContent = s.name
        ml.className = 'absolute -translate-x-1/2 text-[9px] whitespace-nowrap text-white/55 pointer-events-none'
        labelHost.appendChild(ml)
        moonPivots.push({ node: mp, speed: s.speed, mesh: mm, label: ml })
      })

      // Étiquette (sauf petites lunes décoratives).
      const label = document.createElement('button')
      label.textContent = w.name + (w.travelable ? '' : ' ·')
      label.className = `absolute -translate-x-1/2 text-[11px] whitespace-nowrap ${w.travelable ? 'text-white cursor-pointer hover:underline' : 'text-white/55'}`
      label.style.pointerEvents = w.travelable ? 'auto' : 'none'
      label.onclick = () => { if (w.travelable) startFly(w) }
      labelHost.appendChild(label)

      const spinSign = (w.rotH ?? 1) < 0 ? -1 : 1
      bodies.push({
        world: w, mesh, pivot, label, rsize: sz,
        spin: spinSign * 0.005 * (24 / Math.abs(w.rotH ?? 24)),     // rotation propre (lente)
        // Révolution très lente (orrery doux).
        revol: w.parent ? (w.periodD ? 0.025 / Math.sqrt(w.periodD) : 0.001) : (w.periodD ? 0.04 / w.periodD : 0),
      })
    })

    // Ceinture d'astéroïdes (entre Mars et Jupiter).
    const beltGeo = new THREE.BufferGeometry(); const M = 2600, bp = new Float32Array(M * 3)
    const beltIn = 690, beltW = 200, beltH = 12
    for (let i = 0; i < M; i++) { const r = beltIn + Math.random() * beltW, a = Math.random() * 2 * Math.PI; bp[i * 3] = r * Math.cos(a); bp[i * 3 + 1] = (Math.random() - 0.5) * beltH; bp[i * 3 + 2] = r * Math.sin(a) }
    beltGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3))
    const belt = new THREE.Points(beltGeo, new THREE.PointsMaterial({ color: 0x9b8a76, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.6 }))
    scene.add(belt)

    // Démarrage centré sur le monde courant (continuité depuis la carte) : la caméra
    // arrive PRÈS de l'astre puis recule doucement pour révéler le voisinage.
    let intro: { t: number } | null = null
    {
      const cur = bodies.find(b => b.world.id === currentId) ?? bodies.find(b => b.world.id === 'earth')
      if (cur) {
        const wp0 = new THREE.Vector3(); cur.mesh.getWorldPosition(wp0)
        controls.target.copy(wp0)
        const off = new THREE.Vector3(0.35, 0.5, 1).normalize().multiplyScalar(cur.rsize * 3.2)
        camera.position.copy(wp0.clone().add(off)); camera.lookAt(wp0)
        intro = { t: 0 }; controls.enabled = false
      }
    }

    // Survol naturel vers une planète (zoom progressif), puis voyage.
    let flying: { w: World; dir: THREE.Vector3; t: number } | null = null
    // Focus (double-clic) : zoome sur un astre et le suit comme centre de rotation.
    let focus: { id: string; phase: 'in' | 'follow'; dir: THREE.Vector3; t: number; lastBp: THREE.Vector3 } | null = null
    let clickTimer: ReturnType<typeof setTimeout> | null = null

    const startFly = (w: World) => {
      const b = bodies.find(x => x.world.id === w.id); if (!b) return
      const wp = new THREE.Vector3(); b.mesh.getWorldPosition(wp)
      flying = { w, dir: camera.position.clone().sub(wp).normalize(), t: 0 }
      focus = null; controls.enabled = false
    }
    const startFocus = (w: World) => {
      const b = bodies.find(x => x.world.id === w.id); if (!b) return
      const bpv = new THREE.Vector3(); b.mesh.getWorldPosition(bpv)
      focus = { id: w.id, phase: 'in', dir: camera.position.clone().sub(bpv).normalize(), t: 0, lastBp: bpv.clone() }
      intro = null; flying = null; controls.enabled = false
    }

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pick = (e: MouseEvent): World | undefined => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(bodies.map(b => b.mesh), false)[0]
      return hit ? WORLDS.find(x => x.id === (hit.object as THREE.Mesh).userData.worldId) : undefined
    }
    const onClick = (e: MouseEvent) => {
      if (flying) return
      const w = pick(e)
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      // Simple clic différé (220 ms) : voyage si cartographié — annulé par un double-clic.
      if (w?.travelable) clickTimer = setTimeout(() => { clickTimer = null; startFly(w) }, 220)
    }
    const onDblClick = (e: MouseEvent) => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      const w = pick(e)
      if (w) startFocus(w)
    }
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('dblclick', onDblClick)

    const onResize = () => { W = mount.clientWidth || W; H = mount.clientHeight || H; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H) }
    window.addEventListener('resize', onResize)

    const v = new THREE.Vector3(), wp = new THREE.Vector3()
    let raf = 0, tSun = 0
    const animate = () => {
      bodies.forEach(b => { b.pivot.rotation.y += b.revol; b.mesh.rotation.y += b.spin })
      moonPivots.forEach(m => {
        m.node.rotation.y += m.speed * 0.4
        // Étiquette de lune : visible seulement de près (sinon ça encombre).
        m.mesh.getWorldPosition(v)
        const near = camera.position.distanceTo(v) < 130
        v.project(camera)
        const show = near && v.z < 1
        m.label.style.display = show ? 'block' : 'none'
        if (show) { m.label.style.left = `${(v.x * 0.5 + 0.5) * W}px`; m.label.style.top = `${(-v.y * 0.5 + 0.5) * H + 5}px` }
      })
      if (clouds) clouds.rotation.y += 0.0018

      // Soleil : plasma animé (shader) + couronne qui « respire » doucement.
      if (sunFx) {
        tSun += 0.016
        sunFx.uniforms.uTime.value = tSun
        const c = sunFx.sunSize * 2.45 * (1 + Math.sin(tSun * 1.2) * 0.03)
        sunFx.corona.scale.set(c, c, 1)
      }

      if (flying) {
        const b = bodies.find(x => x.world.id === flying!.w.id)!
        b.mesh.getWorldPosition(wp)
        const dist = THREE.MathUtils.lerp(camera.position.distanceTo(wp), b.rsize * 4, 0.08)
        const desired = wp.clone().add(flying.dir.clone().multiplyScalar(dist))
        camera.position.lerp(desired, 0.12)
        controls.target.lerp(wp, 0.12); camera.lookAt(controls.target)
        flying.t += 0.016
        if (flying.t > 1.0 || camera.position.distanceTo(wp) < b.rsize * 5.5) { const w = flying.w; flying = null; onTravel(w); return }
      } else if (focus) {
        const b = bodies.find(x => x.world.id === focus!.id)!
        b.mesh.getWorldPosition(wp)
        if (focus.phase === 'in') {
          // Zoom progressif sur l'astre.
          const dist = THREE.MathUtils.lerp(camera.position.distanceTo(wp), b.rsize * 5, 0.1)
          camera.position.lerp(wp.clone().add(focus.dir.clone().multiplyScalar(dist)), 0.14)
          controls.target.lerp(wp, 0.16); camera.lookAt(controls.target)
          focus.t += 0.016
          if (focus.t > 0.7) { focus.phase = 'follow'; focus.lastBp.copy(wp); controls.enabled = true }
        } else {
          // Suit l'astre (il orbite) : on translate cible ET caméra du même delta
          // → l'astre reste le centre de rotation de la souris.
          const delta = wp.clone().sub(focus.lastBp)
          controls.target.add(delta); camera.position.add(delta); focus.lastBp.copy(wp)
          controls.update()
        }
      } else if (intro) {
        // Recul doux depuis l'astre courant (transition naturelle map→3D→espace).
        const cur = bodies.find(b => b.world.id === currentId)
        if (cur) {
          cur.mesh.getWorldPosition(wp)
          controls.target.lerp(wp, 0.1)
          const dir = camera.position.clone().sub(wp); const d = dir.length(); dir.normalize()
          const nd = THREE.MathUtils.lerp(d, cur.rsize * 12 + (real ? 0 : 14), 0.045)
          camera.position.copy(wp.clone().add(dir.multiplyScalar(nd))); camera.lookAt(controls.target)
        }
        intro.t += 0.016
        if (intro.t > 1.8) { intro = null; controls.enabled = true }
      } else {
        controls.update()
      }

      bodies.forEach(b => {
        b.mesh.getWorldPosition(v); v.project(camera)
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H
        b.label.style.display = v.z < 1 ? 'block' : 'none'
        b.label.style.left = `${x}px`; b.label.style.top = `${y + 10}px`
      })
      renderer.render(scene, camera); raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      if (clickTimer) clearTimeout(clickTimer)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('dblclick', onDblClick)
      controls.dispose(); bodies.forEach(b => b.label.remove()); moonPivots.forEach(m => m.label.remove())
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [onTravel, currentId])

  return (
    <div className="absolute inset-0 z-[1250] no-print bg-[#04060e]">
      <div ref={mountRef} className="w-full h-full" />
      <div ref={labelsRef} className="absolute inset-0 pointer-events-none" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/85 text-sm bg-black/35 rounded-full px-4 py-1.5 pointer-events-none">
        <Telescope size={15} /> Système solaire 3D · glissez/molette · cliquez Terre / Lune / Mars
      </div>
      <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="Fermer">
        <X size={20} />
      </button>
    </div>
  )
}
