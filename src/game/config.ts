/**
 * Tuning centralizado para el vuelo y la misión. Los campos legacy del starter se conservan para
 * que sus pruebas y el panel Tweak sigan siendo compatibles.
 */
export const DEFAULT_CONFIG = {
  run: {
    seconds: 240,
    lives: 3,
    invulnerable: 1.6,
    killY: -18,
  },
  score: {
    core: 100,
    comboWindow: 3.5,
    comboMax: 5,
    timeBonus: 25,
    lifeBonus: 500,
  },
  player: {
    radius: 0.42,
    halfHeight: 0.5,
    walkSpeed: 7,
    sprintSpeed: 11,
    acceleration: 60,
    airControl: 0.45,
    jumpSpeed: 10.5,
    gravity: -30,
    lowJumpGravity: -58,
    maxFall: -40,
    coyoteTime: 0.12,
    jumpBuffer: 0.14,
    dashSpeed: 22,
    dashTime: 0.16,
    dashCooldown: 0.9,
    turnSpeed: 14,
  },
  flight: {
    maxSpeed: 24,
    strafeSpeed: 8,
    acceleration: 16,
    verticalAcceleration: 11,
    yawSpeed: 1.25,
    collectiveSpeed: 0.45,
    hoverCollective: 0.55,
    minAltitude: 1.45,
    maxAltitude: 42,
    fuelBurn: 0.018,
    safeLandingSpeed: 4.5,
  },
  mission: {
    waypointRadius: 4.2,
    landingRadius: 6.5,
    landingAltitude: 4.3,
  },
  camera: {
    distance: 10,
    height: 4.2,
    minPitch: -0.15,
    maxPitch: 0.8,
    follow: 7,
    fov: 64,
  },
  drones: {
    speed: 3.2,
    radius: 0.7,
    rageSpeed: 5,
    rageAt: 45,
  },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
