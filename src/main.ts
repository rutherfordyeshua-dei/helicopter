import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const save = new SaveStore()
  const firstRun = safeGet(SAVE_KEY) === null
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let lockLostAt = 0
  let loop: GameLoop

  const applySettings = (data: SaveData) => {
    input.sensitivity = data.sensitivity
    input.invertY = data.invertY
    audio.setVolumes(data.musicVolume, data.sfxVolume, data.muted)
    if (game) game.reducedMotion = data.reducedMotion
  }
  const startRun = () => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    game.start(false)
    ui.show('hud')
    loop.resetAccumulator()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause(); ui.show('pause'); input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume(); ui.show('hud'); loop.resetAccumulator()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play: startRun,
    restart: startRun,
    resume,
    quit: () => { game?.toTitle(); ui.show('title'); input.unlockPointer() },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch); applySettings(save.data)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)
  let loaded = 0
  const track = <T>(promise: Promise<T>): Promise<T> => promise.then(value => { loaded += 1; ui.setBootProgress(0.1 + (loaded / 4) * 0.9); return value })
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(document.fonts.ready),
  ])
  await physics.initPhysics()
  if (firstRun) { save.update({ quality: suggestQuality() }); ui.refreshSettings() }

  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, {
    popup: (text, at, kind) => ui.popup(text, at, kind),
    hurt: () => ui.hurt(),
    hint: hint => ui.hint(hint),
    tutorialDone: () => save.update({ tutorialDone: true }),
    end: run => window.setTimeout(() => ui.showResults(run), run.phase === 'won' ? 900 : 500),
  })
  game.reducedMotion = save.data.reducedMotion
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
    await registerGameTuning(tuning)
  }
  const g = game
  loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (g.mode === 'playing' || g.mode === 'ended') ui.updateHud(g.telemetry(), g.compass(), g.run)
    },
  })
  loop.start()
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  canvas.addEventListener('click', () => { if (g.mode === 'playing') input.lockPointer() })
  new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')
  window.setTimeout(() => ui.show('title'), 250)
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
}

function safeGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }

boot().catch(error => {
  console.error(error)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">No se pudo iniciar: ${String((error as Error)?.message ?? error).replace(/[<>&]/g, '')}</div>`
})
