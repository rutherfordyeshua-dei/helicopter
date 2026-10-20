import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { CONFIG } from './config'
import { Player } from './player'
import { createRun, tick, type RunState } from './rules'
import { World } from './world'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type Hint = 'move' | 'look' | 'jump' | 'dash' | 'cores'
export type Compass = { angle: number; distance: number; rise: number }
export type Telemetry = {
  altitude: number
  speed: number
  heading: number
  rpm: number
  fuel: number
  waypoint: string
  waypointIndex: number
  waypointTotal: number
  status: string
  autoHover: boolean
  camera: 'chase' | 'cockpit'
}
export type GameHooks = {
  popup(text: string, screen: { x: number; y: number }, kind: 'score' | 'hurt'): void
  hurt(): void
  hint(hint: Hint | null): void
  tutorialDone(): void
  end(run: RunState): void
}

export class Game {
  mode: Mode = 'attract'
  run: RunState
  reducedMotion = false
  private readonly world: World
  private readonly player: Player
  private readonly cam: FollowCamera
  private readonly passed: boolean[]
  readonly cores: { remaining: () => THREE.Vector3[] }
  private time = 0
  private missionNotice = 'DESPEGUE AUTORIZADO'

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
  ) {
    this.world = new World(renderer.shadowMapSize)
    this.player = new Player()
    this.cam = new FollowCamera()
    this.passed = this.world.waypoints.map(() => false)
    this.cores = { remaining: () => this.world.waypoints.filter((_, i) => !this.passed[i]).map(waypoint => waypoint.position.clone()) }
    this.world.scene.add(this.player.root)
    this.run = createRun(this.world.waypoints.length)
    this.cam.reset(this.world.spawn)
  }

  get camera(): THREE.PerspectiveCamera { return this.cam.camera }

  start(_tutorial = false): void {
    this.player.reset(this.world.spawn)
    this.run = createRun(this.world.waypoints.length)
    this.mode = 'playing'
    this.time = 0
    this.missionNotice = 'DESPEGUE AUTORIZADO'
    this.passed.fill(false)
    this.world.waypoints.forEach((_, i) => this.world.setWaypointState(i, false, i === 0))
    this.cam.reset(this.world.spawn)
    this.input.endFrame()
    this.input.takeLook()
    this.hooks.hint(null)
  }

  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }
  resume(): void { if (this.mode === 'paused') { this.mode = 'playing'; this.input.endFrame(); this.input.takeLook() } }
  toTitle(): void { this.mode = 'attract'; this.hooks.hint(null); this.cam.reset(this.world.spawn) }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const materialNeedsUpdate = (object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const material of materials) material.needsUpdate = true
    }
    this.world.scene.traverse(materialNeedsUpdate)
  }

  step(dt: number): void {
    if (this.input.consume('restart') && this.mode !== 'attract') { this.start(false); return }
    if (this.input.consume('jump') && this.mode === 'playing') {
      this.player.autoHover = !this.player.autoHover
      this.audio.play('ui')
      this.missionNotice = this.player.autoHover ? 'AUTO-HOVER ACTIVADO' : 'AUTO-HOVER DESACTIVADO'
    }
    if (this.input.consume('camera') && this.mode === 'playing') {
      const view = this.cam.toggle()
      this.audio.play('ui')
      this.missionNotice = view === 'cockpit' ? 'VISTA DE CABINA' : 'VISTA EXTERIOR'
    }
    if (this.mode !== 'playing') return

    this.player.step(dt, {
      pitch: this.input.move.y,
      roll: this.input.move.x,
      yaw: (this.input.held('yawRight') ? 1 : 0) - (this.input.held('yawLeft') ? 1 : 0),
      collectiveUp: this.input.held('sprint'),
      collectiveDown: this.input.held('collectiveDown'),
    })
    this.run = tick(this.run, dt)
    const position = this.player.position

    for (let i = 0; i < this.world.waypoints.length; i += 1) {
      const waypoint = this.world.waypoints[i]
      if (this.passed[i] || position.distanceTo(waypoint.position) > CONFIG.mission.waypointRadius) continue
      this.passed[i] = true
      this.run = { ...this.run, collected: this.run.collected + 1, score: this.run.score + CONFIG.score.core * 2 }
      this.audio.play('pickup')
      this.hooks.popup(`PUNTO ${i + 1} REGISTRADO`, this.project(waypoint.position), 'score')
      this.missionNotice = this.run.collected === this.run.total ? 'REGRESA A LA BASE PARA ENTREGAR SUMINISTROS' : `SIGUIENTE PUNTO: ${this.world.waypoints[i + 1]?.name ?? 'BASE'}`
      this.world.setWaypointState(i, true, false)
      if (this.world.waypoints[i + 1]) this.world.setWaypointState(i + 1, false, true)
    }

    const allPassed = this.run.collected >= this.run.total
    const atBase = position.distanceTo(this.world.base) <= CONFIG.mission.landingRadius
    const readyToLand = this.player.altitude <= CONFIG.mission.landingAltitude && this.player.speed <= CONFIG.flight.safeLandingSpeed
    if (allPassed && atBase && readyToLand) {
      const timeBonus = Math.ceil(this.run.timeLeft) * 10
      const lifeBonus = this.run.lives * 100
      this.run = { ...this.run, phase: 'won', timeBonus, lifeBonus, score: this.run.score + timeBonus + lifeBonus }
      this.missionNotice = 'ENTREGA COMPLETADA — ATERRIZAJE PERFECTO'
    }
    if (this.player.fuel <= 0 && this.run.phase === 'playing') this.run = { ...this.run, phase: 'lost', loseReason: 'time' }
    if (this.run.phase !== 'playing') this.finishRun()
  }

  render(_alpha: number, frameSeconds: number): void {
    this.time += frameSeconds
    const target = this.player.position
    this.player.animate(frameSeconds, this.time)
    this.world.update(frameSeconds, target)
    if (this.mode === 'attract') {
      const orbit = this.time * 0.12
      this.cam.camera.position.set(Math.sin(orbit) * 36, 18, Math.cos(orbit) * 36)
      this.cam.camera.lookAt(0, 4, -10)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      this.cam.update(target, this.player.heading, look, frameSeconds, false, this.reducedMotion)
    }
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  telemetry(): Telemetry {
    const next = this.world.waypoints.findIndex((_, i) => !this.passed[i])
    const waypoint = next >= 0 ? this.world.waypoints[next].name : 'BASE'
    const status = this.run.phase === 'won' ? 'MISIÓN COMPLETADA' : this.run.phase === 'lost' ? 'MISIÓN INTERRUMPIDA' : this.missionNotice
    return {
      altitude: this.player.altitude,
      speed: this.player.speed * 3.6,
      heading: ((this.player.heading * 180 / Math.PI) + 360) % 360,
      rpm: this.player.rpm,
      fuel: this.player.fuel,
      waypoint,
      waypointIndex: this.run.collected,
      waypointTotal: this.run.total,
      status,
      autoHover: this.player.autoHover,
      camera: this.cam.view,
    }
  }

  compass(): Compass | null {
    const target = this.world.waypoints.find((_, i) => !this.passed[i])?.position ?? (this.run.collected >= this.run.total ? this.world.base : undefined)
    if (!target) return null
    const delta = target.clone().sub(this.player.position)
    const angleToTarget = Math.atan2(delta.x, -delta.z)
    let angle = angleToTarget - this.player.heading
    angle = Math.atan2(Math.sin(angle), Math.cos(angle))
    return { angle, distance: delta.length(), rise: delta.y }
  }

  project(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.cam.camera)
    const canvas = this.renderer.canvas
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight }
  }

  private finishRun(): void {
    if (this.mode !== 'playing') return
    this.mode = 'ended'
    this.audio.play(this.run.phase === 'won' ? 'win' : 'lose')
    this.hooks.end(this.run)
  }
}
