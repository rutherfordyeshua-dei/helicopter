import * as THREE from 'three'

export type Island = { x: number; z: number; top: number; r: number; cores: number; decor?: boolean }
export const ISLANDS: Island[] = [
  { x: 0, z: 0, top: 0, r: 7, cores: 2, decor: true }, { x: 15, z: 3, top: 1.5, r: 4, cores: 2, decor: true },
  { x: 24, z: -8, top: 3.2, r: 3.5, cores: 2 }, { x: 14, z: -19, top: 4.8, r: 4.5, cores: 2, decor: true },
  { x: 0, z: -27, top: 6.5, r: 5, cores: 2, decor: true }, { x: -15, z: -16, top: 4.5, r: 4, cores: 2, decor: true },
  { x: -23, z: 1, top: 2.8, r: 3.5, cores: 2 }, { x: -11, z: 17, top: 1.2, r: 4.5, cores: 2, decor: true },
  { x: 7, z: 17, top: 2.5, r: 3.5, cores: 2 }, { x: 0, z: -12, top: 10.5, r: 3, cores: 3 },
]
const STONE = 1.8
const MAX_GAP = 2.3
const MAX_RISE = 1.05
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function planStones(a: Island, b: Island): { x: number; z: number; top: number }[] {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), gap = d - a.r - b.r, dy = b.top - a.top
  let n = 0
  while ((gap - n * STONE) / (n + 1) > MAX_GAP || Math.abs(dy) / (n + 1) > MAX_RISE) n += 1
  const g = (gap - n * STONE) / (n + 1)
  return Array.from({ length: n }, (_, i) => { const index = i + 1; const along = a.r + g * index + STONE * (index - 0.5); return { x: a.x + (dx / d) * along, z: a.z + (dz / d) * along, top: a.top + (dy * index) / (n + 1) } })
}

export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }
export type Waypoint = { position: THREE.Vector3; name: string; group: THREE.Group; ring: THREE.Mesh; beam: THREE.Mesh; passed: boolean }

const COLORS = { ground: '#6f8f72', grass: '#9fbd79', darkGrass: '#426451', water: '#4f9aab', rock: '#526069', snow: '#e7eee4', amber: '#ffc857', cyan: '#67e8f9', ink: '#17252c' }
function standard(color: string, roughness = 0.8): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 }) }

export class World {
  readonly scene = new THREE.Scene()
  readonly sun = new THREE.DirectionalLight('#ffe6bf', 2.4)
  readonly spawn = new THREE.Vector3(0, 3.8, 10)
  readonly base = new THREE.Vector3(0, 0, 0)
  readonly waypoints: Waypoint[] = []
  private readonly clouds: THREE.Group[] = []
  private time = 0

  constructor(shadowMapSize: number) {
    this.scene.name = 'Rotor Command Valley'
    this.scene.background = new THREE.Color('#8bb7c3')
    this.scene.fog = new THREE.Fog('#8bb7c3', 95, 235)
    this.scene.add(new THREE.HemisphereLight('#d4f1ff', '#355047', 1.6))
    this.sun.position.set(55, 85, 32)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70; this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 180
    this.sun.shadow.bias = -0.0003
    this.scene.add(this.sun, this.sun.target)
    this.addTerrain()
    this.addWater()
    this.addMountains()
    this.addBase()
    this.addVegetation()
    this.addWaypoints()
    this.addClouds()
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt
    for (const cloud of this.clouds) { cloud.position.x += dt * 0.6; if (cloud.position.x > 130) cloud.position.x = -130 }
    for (const [index, waypoint] of this.waypoints.entries()) {
      const pulse = 1 + Math.sin(this.time * 4 + index) * 0.08
      waypoint.ring.scale.setScalar(waypoint.passed ? 0.86 : pulse)
      waypoint.beam.material = waypoint.beam.material as THREE.MeshBasicMaterial
      const mat = waypoint.beam.material as THREE.MeshBasicMaterial
      mat.opacity = waypoint.passed ? 0.12 : 0.26 + Math.sin(this.time * 3 + index) * 0.08
    }
    this.sun.position.set(focus.x + 55, focus.y + 82, focus.z + 32)
    this.sun.target.position.copy(focus)
  }

  setWaypointState(index: number, passed: boolean, active: boolean): void {
    const waypoint = this.waypoints[index]
    if (!waypoint) return
    waypoint.passed = passed
    const material = waypoint.ring.material as THREE.MeshStandardMaterial
    material.color.set(passed ? '#79a98f' : active ? COLORS.cyan : '#6b8b94')
    material.emissive.set(passed ? '#1f3f37' : active ? '#1c9bb5' : '#162d34')
    material.emissiveIntensity = passed ? 0.3 : active ? 2.2 : 0.4
  }

  private addTerrain(): void {
    const geo = new THREE.PlaneGeometry(220, 180, 44, 36)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), z = -pos.getY(i)
      const edge = Math.max(Math.abs(x) / 110, Math.abs(z) / 90)
      const basin = Math.max(0, edge - 0.58) * 8
      const h = Math.sin(x * 0.06) * 0.8 + Math.cos(z * 0.045) * 0.65 - basin
      pos.setZ(i, h)
    }
    geo.computeVertexNormals()
    const terrain = new THREE.Mesh(geo, standard(COLORS.ground))
    terrain.rotation.x = -Math.PI / 2
    terrain.receiveShadow = true
    this.scene.add(terrain)
    const meadow = new THREE.Mesh(new THREE.PlaneGeometry(95, 72), new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 1 }))
    meadow.rotation.x = -Math.PI / 2; meadow.position.y = 0.045; meadow.receiveShadow = true
    this.scene.add(meadow)
  }

  private addWater(): void {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(250, 190), new THREE.MeshPhongMaterial({ color: COLORS.water, transparent: true, opacity: 0.72, shininess: 90 }))
    water.rotation.x = -Math.PI / 2; water.position.set(50, -0.7, -42); water.receiveShadow = true; this.scene.add(water)
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(92, 60), new THREE.MeshStandardMaterial({ color: '#c4b982', roughness: 1 }))
    shore.rotation.x = -Math.PI / 2; shore.position.set(40, -0.22, -34); this.scene.add(shore)
  }

  private addMountains(): void {
    for (const item of [[-68, 0, 24, 28], [65, -38, 30, 25], [-58, -58, 36, 33], [54, 46, 27, 24]] as const) {
      const [x, z, r, h] = item
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), standard(COLORS.rock))
      mountain.position.set(x, h * 0.5 - 2, z); mountain.rotation.y = x * 0.03; mountain.castShadow = true; this.scene.add(mountain)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, h * 0.22, 7), standard(COLORS.snow))
      cap.position.set(x, h * 0.89 - 2, z); cap.rotation.y = mountain.rotation.y; this.scene.add(cap)
    }
  }

  private addBase(): void {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.24, 48), standard('#273b40', 0.58))
    pad.position.set(this.base.x, 0.12, this.base.z); pad.receiveShadow = true; pad.castShadow = true; this.scene.add(pad)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 10, 48), standard(COLORS.amber, 0.38))
    ring.rotation.x = Math.PI / 2; ring.position.copy(this.base); ring.position.y = 0.28; this.scene.add(ring)
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 3.2), standard(COLORS.amber))
    const v = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.48), standard(COLORS.amber))
    h.position.set(0, 0.3, 0); v.position.copy(h.position); this.scene.add(h, v)
    const beacon = new THREE.PointLight(COLORS.amber, 1.5, 14); beacon.position.set(0, 2.4, 0); this.scene.add(beacon)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.4, 8), standard('#32484c'))
    tower.position.set(5.7, 1.7, -2.4); tower.castShadow = true; this.scene.add(tower)
  }

  private addWaypoints(): void {
    const points = [[18, 10, -24, 'NORTE'], [-22, 15, -42, 'LAGO'], [-32, 9, 14, 'VALLE']] as const
    for (const [x, y, z, name] of points) {
      const group = new THREE.Group(); group.position.set(x, y, z)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.18, 10, 40), new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: '#1c9bb5', emissiveIntensity: 2.2, roughness: 0.34 }))
      ring.rotation.x = Math.PI / 2; group.add(ring)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, y, 8), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.3, depthWrite: false }))
      beam.position.y = -y * 0.5; group.add(beam)
      const beacon = new THREE.PointLight(COLORS.cyan, 1.1, 9); group.add(beacon)
      this.scene.add(group)
      this.waypoints.push({ position: new THREE.Vector3(x, y, z), name, group, ring, beam, passed: false })
    }
  }

  private addVegetation(): void {
    const random = rng(2048)
    for (let i = 0; i < 58; i += 1) {
      const x = (random() - 0.5) * 86, z = (random() - 0.5) * 66
      if (Math.hypot(x, z) < 10 || (x > 8 && z < -14)) continue
      const scale = 0.65 + random() * 0.85
      const tree = new THREE.Group(); tree.position.set(x, 0, z); tree.scale.setScalar(scale)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.35, 7), standard('#5a4434'))
      trunk.position.y = 0.68; tree.add(trunk)
      for (let j = 0; j < 2; j += 1) { const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72 - j * 0.12, 1), standard(j ? '#477d5b' : '#5e9862')); leaf.position.y = 1.45 + j * 0.48; tree.add(leaf) }
      tree.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true })
      this.scene.add(tree)
    }
  }

  private addClouds(): void {
    const random = rng(71)
    for (let i = 0; i < 12; i += 1) {
      const cloud = new THREE.Group()
      for (let j = 0; j < 4; j += 1) { const puff = new THREE.Mesh(new THREE.SphereGeometry(2.5 + random() * 2.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#edf5ed', transparent: true, opacity: 0.48 })); puff.position.set(j * 3.1 - 4.6, random() * 1.5, (random() - 0.5) * 2.5); puff.scale.y = 0.48; cloud.add(puff) }
      cloud.position.set((random() - 0.5) * 190, 22 + random() * 16, (random() - 0.5) * 160); cloud.scale.setScalar(0.7 + random() * 0.8); this.clouds.push(cloud); this.scene.add(cloud)
    }
  }
}
