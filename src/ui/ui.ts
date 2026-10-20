import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { type Quality, type SaveData, type SaveStore } from '../engine/save'
import type { Compass, Hint, Telemetry } from '../game/game'
import type { RunState } from '../game/rules'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results'
export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
}

export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private stack: Screen[] = []
  private lastRun?: RunState
  private lastTelemetry?: Telemetry

  constructor(
    i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    document.documentElement.lang = i18n.locale
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', event => this.onClick(event))
    this.root.addEventListener('input', event => this.onInput(event))
    window.addEventListener('keydown', event => this.onKey(event))
    this.refreshSettings()
  }

  show(screen: Screen): void { this.stack = []; this.setScreen(screen) }
  push(screen: Screen): void { this.stack.push(this.screen); this.setScreen(screen) }
  back(): void { const previous = this.stack.pop(); if (previous) this.setScreen(previous); else if (this.screen === 'pause') this.actions.resume() }
  setBootProgress(progress: number): void { this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})` }

  updateHud(telemetry: Telemetry, compass: Compass | null, run?: RunState): void {
    this.lastTelemetry = telemetry
    if (run) this.lastRun = run
    const set = (slot: string, value: string) => { this.q(`[data-slot="${slot}"]`).textContent = value }
    set('altitude', `${Math.round(telemetry.altitude).toString().padStart(2, '0')} m`)
    set('speed', `${Math.round(telemetry.speed).toString().padStart(3, '0')} km/h`)
    set('heading', `${Math.round(telemetry.heading).toString().padStart(3, '0')}°`)
    set('rpm', `${Math.round(telemetry.rpm)} %`)
    set('fuel', `${Math.round(telemetry.fuel)} %`)
    set('waypoint', `${telemetry.waypointIndex}/${telemetry.waypointTotal} · ${telemetry.waypoint}`)
    set('mission', telemetry.status)
    set('camera', telemetry.camera === 'cockpit' ? 'CABINA' : 'EXTERIOR')
    set('hover', telemetry.autoHover ? 'AUTO-HOVER ON' : 'AUTO-HOVER OFF')
    const progress = this.q<HTMLElement>('.mission-progress i')
    progress.style.transform = `scaleX(${telemetry.waypointTotal ? telemetry.waypointIndex / telemetry.waypointTotal : 0})`
    const clock = Math.max(0, Math.ceil(this.lastRun?.timeLeft ?? 240))
    set('clock', `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`)
    const compassEl = this.q<HTMLElement>('.compass')
    compassEl.classList.toggle('is-hidden', !compass)
    if (compass) {
      this.q<HTMLElement>('.compass-arrow').style.transform = `rotate(${-compass.angle}rad)`
      set('distance', `${Math.round(compass.distance)} m`)
    }
  }

  showResults(run: RunState): void {
    this.lastRun = run
    this.q('.results-title').textContent = run.phase === 'won' ? 'MISIÓN COMPLETADA' : 'MISIÓN INTERRUMPIDA'
    this.q('.results-kicker').textContent = run.phase === 'won' ? 'Suministros entregados en zona segura' : 'El helicóptero necesita volver a intentarlo'
    this.q('[data-result="score"]').textContent = run.score.toLocaleString('es-ES')
    this.q('[data-result="time"]').textContent = `${Math.floor(run.elapsed / 60)}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}`
    this.q('[data-result="points"]').textContent = `${run.collected} / ${run.total}`
    this.q('[data-result="fuel"]').textContent = `${Math.max(0, Math.round(this.lastTelemetry?.fuel ?? 0))}%`
    this.show('results')
  }

  popup(text: string, at: { x: number; y: number }, kind: 'score' | 'hurt'): void {
    const el = document.createElement('div')
    el.className = `popup popup-${kind}`
    el.textContent = text
    el.style.left = `${at.x}px`; el.style.top = `${at.y}px`
    this.q('.popups').append(el)
    el.addEventListener('animationend', () => el.remove())
  }
  hurt(): void { const el = this.q('.hurt-vignette'); el.classList.remove('flash'); void (el as HTMLElement).offsetWidth; el.classList.add('flash') }
  hint(hint: Hint | null): void { const el = this.q('.hint'); el.textContent = hint ? `CONTROLES: W/S cabeceo · A/D alabeo · Q/E giro · Shift/Ctrl colectivo · Space auto-hover` : ''; el.classList.toggle('is-active', Boolean(hint)) }
  frame(_frameSeconds: number): void {}
  refreshSettings(): void {
    const d = this.save.data
    for (const input of this.qa<HTMLInputElement>('input[type="range"]')) input.value = String(d[input.name as 'musicVolume' | 'sfxVolume' | 'sensitivity'] ?? input.value)
    for (const toggle of this.qa<HTMLButtonElement>('.toggle')) toggle.setAttribute('aria-pressed', String(d[toggle.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'] === true))
    for (const button of this.qa<HTMLButtonElement>('[data-quality]')) button.classList.toggle('is-selected', button.dataset.quality === d.quality)
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, [data-quality]')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings(); this.audio.play('ui'); return
    }
    if (target.matches('[data-quality]')) {
      this.actions.settings({ quality: target.dataset.quality as Quality }); this.refreshSettings(); this.audio.play('ui'); return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'leaderboard': this.push('leaderboard'); break
      case 'back': this.back(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.type !== 'range') return
    const key = input.name as 'musicVolume' | 'sfxVolume' | 'sensitivity'
    this.actions.settings({ [key]: Number(input.value) })
  }

  private onKey(event: KeyboardEvent): void {
    if ((event.code === 'Escape' || event.code === 'Backspace') && this.screen !== 'title' && this.screen !== 'hud' && this.screen !== 'pause' && this.screen !== 'results') {
      event.preventDefault(); this.input.consume('pause'); this.back()
    }
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const element of this.qa<HTMLElement>('[data-screen]')) {
      const active = element.dataset.screen === screen
      element.classList.toggle('is-active', active)
      element.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)! }
  private qa<T extends HTMLElement = HTMLElement>(selector: string): T[] { return [...this.root.querySelectorAll<T>(selector)] }

  private template(): string {
    return `
<section class="screen screen-boot is-active" data-screen="boot"><div class="boot-mark">ROTOR COMMAND</div><div class="boot-bar"><i></i></div><div class="boot-label">INICIALIZANDO AVIÓNICA</div></section>
<section class="screen screen-title" data-screen="title"><div class="title-grid"></div><div class="title-scanline"></div><div class="title-block"><div class="eyebrow">SIMULADOR DE VUELO · OPERACIÓN 01</div><h1>ROTOR<br><span>COMMAND</span></h1><p>Controla el vuelo. Encuentra los puntos. Regresa a la base.</p><nav class="menu"><button class="btn btn-primary" data-action="play">INICIAR VUELO <b>ENTER</b></button><button class="btn" data-action="leaderboard">REGISTRO DE MISIÓN</button><button class="btn" data-action="settings">AJUSTES</button></nav></div><div class="title-coordinates">34° 12' N<br>118° 15' O</div><footer class="bottom-bar"><span>TECLADO WINDOWS · VERSIÓN DE ENTRENAMIENTO</span><span>© ROTOR COMMAND</span></footer></section>
<section class="screen screen-hud" data-screen="hud"><div class="hud-corner hud-corner-tl"><div class="hud-brand">RC / 01</div><div class="hud-mission-label">MISIÓN <b>ENTREGA DE SUMINISTROS</b></div><div class="hud-status" data-slot="mission">DESPEGUE AUTORIZADO</div><div class="mission-progress"><i></i></div></div><div class="hud-corner hud-corner-tr"><div class="hud-chip" data-slot="camera">EXTERIOR</div><div class="hud-chip hud-chip-amber" data-slot="hover">AUTO-HOVER ON</div><button class="hud-pause" data-action="pause">||</button></div><div class="compass"><div class="compass-label">RUMBO AL SIGUIENTE PUNTO · <b data-slot="distance">-- m</b></div><div class="compass-line"><i class="compass-arrow">◆</i></div></div><div class="reticle"><i></i><b>FLIGHT PATH</b></div><div class="hud-bottom"><div class="instrument"><span>ALTITUD</span><b data-slot="altitude">00 m</b></div><div class="instrument"><span>VELOCIDAD</span><b data-slot="speed">000 km/h</b></div><div class="instrument"><span>RUMBO</span><b data-slot="heading">000°</b></div><div class="instrument"><span>RPM</span><b data-slot="rpm">58 %</b></div><div class="instrument fuel"><span>COMBUSTIBLE</span><b data-slot="fuel">100 %</b></div><div class="hud-time"><span>TIEMPO</span><b data-slot="clock">4:00</b></div></div><div class="waypoint-readout"><span>WAYPOINT</span><b data-slot="waypoint">0/3 · NORTE</b></div><div class="popups"></div><div class="hurt-vignette"></div><div class="hint"></div><div class="touch"><div class="touch-stick"><i></i></div><button class="touch-btn" data-touch="jump">AUTO</button></div></section>
<section class="screen screen-pause screen-modal" data-screen="pause"><div class="modal"><div class="modal-tag">FLIGHT COMPUTER</div><h2>PAUSA</h2><p>La simulación está detenida.</p><nav class="menu"><button class="btn btn-primary" data-action="resume">CONTINUAR</button><button class="btn" data-action="restart">REINICIAR VUELO</button><button class="btn" data-action="settings">AJUSTES</button><button class="btn" data-action="quit">SALIR AL MENÚ</button></nav></div></section>
<section class="screen screen-settings screen-modal" data-screen="settings"><div class="modal modal-wide"><div class="modal-tag">CONFIGURACIÓN DE AVIÓNICA</div><h2>AJUSTES</h2><div class="settings-grid"><label>VOLUMEN MÚSICA <input type="range" name="musicVolume" min="0" max="1" step="0.05"></label><label>VOLUMEN SFX <input type="range" name="sfxVolume" min="0" max="1" step="0.05"></label><label>SENSIBILIDAD <input type="range" name="sensitivity" min="0.2" max="3" step="0.1"></label><div class="setting-row"><span>CALIDAD GRÁFICA</span><div><button data-quality="low">BAJA</button><button data-quality="medium">MEDIA</button><button data-quality="high">ALTA</button></div></div><button class="toggle" data-setting="reducedMotion" aria-pressed="false">REDUCIR MOVIMIENTO <i></i></button><button class="toggle" data-setting="muted" aria-pressed="false">SILENCIAR AUDIO <i></i></button></div><button class="btn btn-primary" data-action="back">VOLVER</button></div></section>
<section class="screen screen-leaderboard screen-modal" data-screen="leaderboard"><div class="modal"><div class="modal-tag">REGISTRO DE MISIÓN</div><h2>VUELOS DESTACADOS</h2><p>El entrenamiento actual se guarda localmente en este equipo.</p><div class="leader-note">PRIORIDAD: CONTROL · PRECISIÓN · REGRESO SEGURO</div><button class="btn btn-primary" data-action="back">VOLVER</button></div></section>
<section class="screen screen-results screen-modal" data-screen="results"><div class="modal modal-results"><div class="modal-tag">DEBRIEFING</div><h2 class="results-title">MISIÓN COMPLETADA</h2><p class="results-kicker">Suministros entregados en zona segura</p><div class="result-grid"><span>PUNTOS DE CONTROL</span><b data-result="points">3 / 3</b><span>TIEMPO DE VUELO</span><b data-result="time">0:00</b><span>COMBUSTIBLE RESTANTE</span><b data-result="fuel">100%</b><span>PUNTUACIÓN</span><b class="result-score" data-result="score">0</b></div><nav class="menu menu-row"><button class="btn btn-primary" data-action="restart">REPETIR</button><button class="btn" data-action="quit">MENÚ PRINCIPAL</button></nav></div></section>`
  }
}
