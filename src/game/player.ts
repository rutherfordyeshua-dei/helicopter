import * as THREE from 'three'
import { CONFIG } from './config'
import { tuning } from './tuning'

export type FlightInput = {
  pitch: number
  roll: number
  yaw: number
  collectiveUp: boolean
  collectiveDown: boolean
}
export type PlayerIntent = { moveX: number; moveY: number; sprint: boolean; jumpPressed: boolean; jumpHeld: boolean; dashPressed: boolean }
export type PlayerEvent = { type: 'jump' } | { type: 'land'; impact: number } | { type: 'dash' }

const FLIGHT = CONFIG.flight

function mat(color: string, roughness = 0.72, metalness = 0.12): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

export class Player {
  readonly root = new THREE.Group()
  readonly collider: unknown = {}
  readonly shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: '#10252a', transparent: true, opacity: 0.24, depthWrite: false }))
  readonly velocity = new THREE.Vector3()
  readonly rotor = new THREE.Group()
  readonly tailRotor = new THREE.Group()
  heading = 0
  pitch = 0
  roll = 0
  collective = FLIGHT.hoverCollective
  autoHover = true
  fuel = 100
  rpm = 58
  grounded = true
  facing = 0
  readonly safe = new THREE.Vector3()
  private legacyDashTime = 0

  private readonly body = new THREE.Group()
  private readonly glass = mat('#8bd8e8', 0.18, 0.35)

  constructor(_physics?: unknown, spawn?: THREE.Vector3, _movers?: unknown[]) {
    this.root.name = 'helicopter'
    this.root.rotation.order = 'YXZ'
    this.buildModel()
    if (spawn) this.reset(spawn)
  }

  get position(): THREE.Vector3 { return this.root.position }
  get speed(): number { return this.velocity.length() }
  get altitude(): number { return Math.max(0, this.root.position.y) }

  reset(position: THREE.Vector3): void {
    this.root.position.copy(position)
    this.safe.copy(position)
    this.velocity.set(0, 0, 0)
    this.heading = 0
    this.pitch = 0
    this.roll = 0
    this.collective = FLIGHT.hoverCollective
    this.autoHover = true
    this.fuel = 100
    this.rpm = 58
  }

  teleport(position: THREE.Vector3): void { this.root.position.copy(position); this.velocity.set(0, 0, 0); this.safe.copy(position); this.grounded = true; this.legacyDashTime = 0 }

  step(dt: number, controls: FlightInput | PlayerIntent, _cameraYaw?: number, events: PlayerEvent[] = []): void {
    if ('moveX' in controls) {
      const intent = controls
      const speed = intent.sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed
      if (intent.dashPressed && this.legacyDashTime <= 0) {
        tuning.activate('dash')
        this.velocity.x = intent.moveX * CONFIG.player.dashSpeed
        this.velocity.z = intent.moveY * CONFIG.player.dashSpeed
        this.legacyDashTime = CONFIG.player.dashTime
        events.push({ type: 'dash' })
      } else if (this.legacyDashTime <= 0) {
        const k = 1 - Math.exp(-CONFIG.player.acceleration * dt / 6)
        this.velocity.x += (intent.moveX * speed - this.velocity.x) * k
        this.velocity.z += (intent.moveY * speed - this.velocity.z) * k
      }
      this.legacyDashTime = Math.max(0, this.legacyDashTime - dt)
      if (intent.jumpPressed && this.grounded) {
        tuning.activate('jump')
        this.velocity.y = CONFIG.player.jumpSpeed
        this.grounded = false
        events.push({ type: 'jump' })
      }
      if (!this.grounded) {
        const gravity = this.velocity.y > 0 && intent.jumpHeld ? CONFIG.player.gravity : CONFIG.player.lowJumpGravity
        this.velocity.y = Math.max(CONFIG.player.maxFall, this.velocity.y + gravity * dt)
      }
      this.root.position.addScaledVector(this.velocity, dt)
      if (this.root.position.y <= 0.1) { this.root.position.y = 0.1; this.velocity.y = 0; this.grounded = true }
      this.facing = Math.atan2(-intent.moveX, -intent.moveY || -1)
      return
    }

    const flight = controls
    this.heading += flight.yaw * FLIGHT.yawSpeed * dt
    const collectiveDelta = (flight.collectiveUp ? 1 : 0) - (flight.collectiveDown ? 1 : 0)
    this.collective = THREE.MathUtils.clamp(this.collective + collectiveDelta * FLIGHT.collectiveSpeed * dt, 0.22, 0.92)
    if (this.autoHover) this.collective = THREE.MathUtils.damp(this.collective, FLIGHT.hoverCollective, 3.2, dt)

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, -Math.cos(this.heading))
    const right = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading))
    const cruise = 0.18 + this.collective * 0.9
    const desired = forward.multiplyScalar(flight.pitch * FLIGHT.maxSpeed * cruise).add(right.multiplyScalar(flight.roll * FLIGHT.strafeSpeed))
    const horizontalK = 1 - Math.exp(-FLIGHT.acceleration * dt)
    this.velocity.x += (desired.x - this.velocity.x) * horizontalK
    this.velocity.z += (desired.z - this.velocity.z) * horizontalK

    const targetVertical = this.autoHover ? 0 : (this.collective - FLIGHT.hoverCollective) * 15
    const verticalK = 1 - Math.exp(-FLIGHT.verticalAcceleration * dt)
    this.velocity.y += (targetVertical - this.velocity.y) * verticalK
    this.root.position.addScaledVector(this.velocity, dt)
    if (this.root.position.y < FLIGHT.minAltitude) { this.root.position.y = FLIGHT.minAltitude; if (this.velocity.y < 0) this.velocity.y = 0 }
    if (this.root.position.y > FLIGHT.maxAltitude) { this.root.position.y = FLIGHT.maxAltitude; if (this.velocity.y > 0) this.velocity.y = 0 }
    this.pitch = THREE.MathUtils.damp(this.pitch, -flight.pitch * 0.34, 8, dt)
    this.roll = THREE.MathUtils.damp(this.roll, flight.roll * 0.48, 8, dt)
    this.root.rotation.set(this.pitch, this.heading, this.roll)
    this.rpm = THREE.MathUtils.clamp(54 + Math.abs(this.collective - FLIGHT.hoverCollective) * 110 + this.speed * 1.4, 48, 100)
    this.fuel = Math.max(0, this.fuel - dt * (FLIGHT.fuelBurn + this.rpm * 0.0005))
  }

  animate(frameSeconds: number, time: number): void {
    this.rotor.rotation.y += frameSeconds * (this.rpm * 0.32)
    this.tailRotor.rotation.x += frameSeconds * (this.rpm * 0.48)
    this.body.position.y = Math.sin(time * 5.2) * 0.018 * (this.autoHover ? 1 : 0.4)
  }

  private buildModel(): void {
    const dark = mat('#1c2a31', 0.42, 0.5)
    const olive = mat('#5e6b57', 0.78, 0.15)
    const highlight = mat('#d9e3d1', 0.4, 0.28)
    const warning = mat('#ffc857', 0.3, 0.3)

    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.95, 3.25), olive)
    fuselage.castShadow = true
    this.body.add(fuselage)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 10), this.glass)
    nose.scale.set(0.86, 0.62, 0.72)
    nose.position.z = -1.43
    nose.castShadow = true
    this.body.add(nose)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 3.15), warning)
    stripe.position.y = 0.33
    this.body.add(stripe)

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 3.8), dark)
    tail.position.z = 3.12
    tail.position.y = 0.08
    tail.rotation.x = -0.05
    tail.castShadow = true
    this.body.add(tail)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), highlight)
    fin.position.set(0, 0.55, 4.55)
    fin.rotation.x = -0.28
    this.body.add(fin)

    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 8), dark)
      skid.rotation.z = Math.PI / 2
      skid.position.set(side * 0.78, -0.7, 0.12)
      this.body.add(skid)
      for (const z of [-0.75, 1.05]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8), dark)
        strut.position.set(side * 0.72, -0.36, z)
        strut.rotation.z = side * 0.18
        this.body.add(strut)
      }
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 8), dark)
    mast.position.y = 0.85
    this.body.add(mast)
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 7.1), dark)
    cross.position.y = 1.26
    cross.castShadow = true
    this.rotor.add(cross)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 4.4), highlight)
    blade.position.z = -2.2
    this.rotor.add(blade)
    const blade2 = blade.clone()
    blade2.rotation.y = Math.PI / 2
    blade2.position.set(2.2, 0, 0)
    this.rotor.add(blade2)
    this.rotor.position.y = 1.26
    this.body.add(this.rotor)

    const tailHub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10), dark)
    tailHub.rotation.z = Math.PI / 2
    tailHub.position.set(0, 0.05, 4.78)
    this.body.add(tailHub)
    const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.12), warning)
    this.tailRotor.add(tailBlade)
    const tailBlade2 = tailBlade.clone()
    tailBlade2.rotation.z = Math.PI / 2
    this.tailRotor.add(tailBlade2)
    this.tailRotor.position.set(0, 0.05, 4.78)
    this.body.add(this.tailRotor)

    const beacon = new THREE.PointLight('#ffc857', 0.9, 5)
    beacon.position.set(0, 1.1, 0.2)
    this.body.add(beacon)
    this.root.add(this.body)
  }
}
