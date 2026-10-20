import * as THREE from 'three'
import { CONFIG } from './config'

export type CameraView = 'chase' | 'cockpit'

export class FollowCamera {
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 500)
  view: CameraView = 'chase'
  yawOffset = 0
  pitch = 0.34
  private readonly aim = new THREE.Vector3()
  private shake = 0

  constructor(_physics?: unknown, _exclude?: unknown) {}

  addShake(amount: number): void { this.shake = Math.min(1, this.shake + amount) }
  toggle(): CameraView { this.view = this.view === 'chase' ? 'cockpit' : 'chase'; return this.view }
  reset(target: THREE.Vector3, heading = 0): void {
    this.yawOffset = 0
    this.pitch = 0.34
    this.aim.copy(target)
    this.view = 'chase'
    this.update(target, heading, { x: 0, y: 0 }, 1, true, false)
  }

  update(target: THREE.Vector3, headingOrLook: number | { x: number; y: number }, lookOrFrame: { x: number; y: number } | number, frameOrSnap: number | boolean, _snapOrReduced = false, reducedMotion = false): void {
    if (typeof headingOrLook !== 'number') {
      const look = headingOrLook
      const frameSeconds = typeof lookOrFrame === 'number' ? lookOrFrame : 1
      const snap = typeof frameOrSnap === 'boolean' ? frameOrSnap : false
      this.camera.fov = CONFIG.camera.fov
      this.camera.updateProjectionMatrix()
      this.aim.copy(target).add(new THREE.Vector3(0, CONFIG.camera.height * 0.45, 0))
      this.camera.position.set(this.aim.x, this.aim.y, this.aim.z + CONFIG.camera.distance)
      this.camera.lookAt(this.aim)
      if (!snap) this.yawOffset -= look.x * frameSeconds
      return
    }
    const heading = headingOrLook
    const look = typeof lookOrFrame === 'object' ? lookOrFrame : { x: 0, y: 0 }
    const frameSeconds = typeof lookOrFrame === 'number' ? lookOrFrame : (typeof frameOrSnap === 'number' ? frameOrSnap : 1)
    const snap = typeof lookOrFrame === 'object' && typeof frameOrSnap === 'boolean' ? frameOrSnap : false
    this.yawOffset -= look.x
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, CONFIG.camera.minPitch, CONFIG.camera.maxPitch)
    this.camera.fov = CONFIG.camera.fov
    this.camera.updateProjectionMatrix()
    if (snap) this.aim.copy(target)
    else {
      const k = 1 - Math.exp(-CONFIG.camera.follow * frameSeconds)
      this.aim.lerp(target, k)
    }
    const fwd = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading))
    if (this.view === 'cockpit') {
      this.camera.position.copy(this.aim).add(new THREE.Vector3(0, 0.48, -1.05))
      const lookAt = this.aim.clone().addScaledVector(fwd, 22).add(new THREE.Vector3(0, 0.85 + this.pitch * 1.2, 0))
      this.camera.lookAt(lookAt)
    } else {
      const angle = heading + this.yawOffset
      const back = new THREE.Vector3(-Math.sin(angle) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(angle) * Math.cos(this.pitch))
      this.camera.position.copy(this.aim).addScaledVector(back, CONFIG.camera.distance)
      this.camera.position.y += CONFIG.camera.height
      this.camera.lookAt(this.aim.clone().add(new THREE.Vector3(0, 0.35, 0)))
    }
    if (this.shake > 0 && !reducedMotion) {
      const amount = this.shake * this.shake * 0.16
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount))
    }
    this.shake = Math.max(0, this.shake - frameSeconds * 2.6)
  }
}
