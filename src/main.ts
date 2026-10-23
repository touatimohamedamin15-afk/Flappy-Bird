import '@fontsource-variable/dm-sans'
import '@fontsource-variable/fraunces'
import './style.css'
import { createFlight, flap, step, STEP, type Flight } from './game/physics'
import { render, type Scene } from './game/render'
import { Sound } from './game/sound'

const icons = {
  trophy:
    '<path d="M8 3h8v5a4 4 0 0 1-8 0V3Z"/><path d="M8 5H5v2a4 4 0 0 0 4 4m7-6h3v2a4 4 0 0 1-4 4M12 12v5m-4 3h8m-6-3h4v3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
}
function icon(name: keyof typeof icons) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
}
function element<T extends HTMLElement>(id: string) {
  return document.getElementById(id)! as T
}
function readLocal(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Private mode still plays. */
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Could not connect.')
  return data
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="/" aria-label="Little wings home"><img src="/favicon.svg" width="36" height="36" alt=""/><span>Little wings</span></a>
    <nav aria-label="Game"><button id="leaders" class="quiet">${icon('trophy')}<span>Leaderboard</span></button><div id="account"></div></nav>
  </header>
  <main class="game-shell">
    <section id="stage" class="stage" aria-label="Flappy Bird">
      <canvas id="game" tabindex="0" aria-label="Flappy Bird. Space, arrow up, or tap to flap. Escape to pause."></canvas>
      <div id="hud" class="hud" hidden><span id="score" class="score">0</span><button id="pause" class="stage-button" aria-label="Pause game">${icon('pause')}</button></div>
      <div id="start-screen" class="start-screen">
        <h1>Flappy Bird<span class="title-dot">.</span></h1>
        <div class="start-actions"><button id="start" class="primary">Let’s fly ${icon('arrow')}</button><span class="key-hint"><kbd>Space</kbd><span>or tap to fly</span></span></div>
      </div>
      <div id="result-screen" class="scrim" hidden>
        <div class="result-card"><span id="result-eyebrow" class="eyebrow">Nice flight</span><h2 id="result-score">0</h2>
          <div class="result-best">${icon('trophy')}<span>Best <strong id="result-best">0</strong></span></div>
          <button id="again" class="primary">Fly again ${icon('arrow')}</button>
          <div id="save-status" class="save-status"></div>
        </div>
      </div>
      <div id="pause-screen" class="scrim" hidden><div class="pause-card"><h2>Paused</h2><button id="resume" class="primary">Keep flying ${icon('play')}</button></div></div>
      <div id="countdown" class="countdown" hidden aria-live="polite"></div>
      <div id="toast" class="toast" role="status" hidden></div>
    </section>
    <footer class="footer"><span class="best">${icon('trophy')}<span>Best <strong id="best">0</strong></span></span>
      
      <div class="utilities"><button id="sound" class="icon-button" aria-label="Turn sound on" aria-pressed="false">${icon('mute')}</button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen">${icon('expand')}</button></div>
    </footer>
  </main>
  <dialog id="leader-dialog"><div class="dialog-head"><h2>High flyers</h2><button id="close-leaders" class="icon-button" aria-label="Close leaderboard">${icon('close')}</button></div>
    <div id="leader-content"></div><div id="leader-account"></div>
  </dialog>
  <div id="announcement" class="sr-only" aria-live="polite"></div>
`

const canvas = element<HTMLCanvasElement>('game'),
  ctx = canvas.getContext('2d', { alpha: false })!
const stage = element('stage'),
  sound = new Sound(),
  dialog = element<HTMLDialogElement>('leader-dialog')
type Mode =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'countdown'
  | 'dying'
  | 'over'
let mode: Mode = 'idle',
  flight: Flight = createFlight(10),
  inputs: number[] = [],
  runId: string | null = null
let best = Math.max(0, Number(readLocal('little-wings-best')) || 0),
  user: { name: string } | null = null,
  authEnabled = false
let elapsed = 0,
  accumulator = 0,
  lastFrame = 0,
  width = 0,
  height = 0,
  deathAt = 0,
  countdownAt = 0
let pointPop = 0,
  impact = 0,
  pausedFrom: 'idle' | 'over' | null = null
let particles: Scene['particles'] = [],
  savePending: { id: string; ticks: number; inputs: number[] } | null = null
let sessionLoaded = false,
  toastTimer = 0
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
sound.enabled = readLocal('little-wings-sound') === 'on'
element('best').textContent = String(best)
function toast(message: string) {
  const node = element('toast')
  node.textContent = message
  node.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    node.hidden = true
  }, 4000)
}
function updateSound() {
  element('sound').innerHTML = icon(sound.enabled ? 'sound' : 'mute')
  element('sound').setAttribute(
    'aria-label',
    sound.enabled ? 'Turn sound off' : 'Turn sound on',
  )
  element('sound').setAttribute('aria-pressed', String(sound.enabled))
}
updateSound()
function signInLink(label = 'Sign in with Freebuff') {
  const link = document.createElement('a')
  link.href = '/auth/freebuff/signin?returnTo=%2F'
  link.className = 'sign-in'
  link.textContent = label
  link.addEventListener('click', () => pause())
  return link
}
function renderAccount() {
  const account = element('account')
  account.replaceChildren()
  if (user) {
    const form = document.createElement('form')
    form.method = 'post'
    form.action = '/auth/freebuff/signout'
    const button = document.createElement('button')
    button.type = 'submit'
    button.className = 'quiet account-button'
    button.textContent = 'Sign out'
    button.title = user.name
    form.append(button)
    account.append(form)
  } else if (authEnabled) account.append(signInLink())
}
const sessionReady = api<{ user: typeof user; authEnabled: boolean }>(
  '/api/session',
)
  .then((session) => {
    user = session.user
    authEnabled = session.authEnabled
    renderAccount()
  })
  .catch(() => {
    toast('Playing offline. Scores stay on this device.')
  })
  .finally(() => {
    sessionLoaded = true
  })

function resize() {
  const bounds = stage.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2)
  width = bounds.width
  height = bounds.height
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
new ResizeObserver(resize).observe(stage)
resize()

async function start() {
  if (!['idle', 'over'].includes(mode) || dialog.open) return
  mode = 'starting'
  sound.unlock()
  element<HTMLButtonElement>('start').disabled = true
  element<HTMLButtonElement>('again').disabled = true
  let seed = crypto.getRandomValues(new Uint32Array(1))[0]
  runId = null
  if (!sessionLoaded) await sessionReady
  if (user) {
    try {
      const run = await api<{ id: string; seed: number }>('/api/runs', {})
      seed = run.seed
      runId = run.id
    } catch {
      toast('Practice flight. Leaderboard couldn’t connect.')
    }
  }
  flight = createFlight(seed)
  previousY = flight.y
  previousDistance = flight.distance
  inputs = []
  particles = []
  accumulator = 0
  impact = 0
  element('score').textContent = '0'
  element('hud').hidden = false
  element('start-screen').hidden = true
  element('result-screen').hidden = true
  element<HTMLButtonElement>('start').disabled = false
  element<HTMLButtonElement>('again').disabled = false
  stage.classList.add('in-flight')
  canvas.focus({ preventScroll: true })
  mode = 'playing'
  doFlap()
  if (document.hidden || !document.hasFocus()) pause()
}
function doFlap() {
  if (mode !== 'playing' || !flap(flight)) return
  inputs.push(flight.tick)
  sound.play('flap')
  if (!reducedMotion)
    for (let i = 0; i < 3; i++)
      particles.push({
        x: flight.distance - 21,
        y: flight.y + 3,
        life: 0.7,
        vx: -30 - Math.random() * 25,
        vy: (Math.random() - 0.5) * 50,
      })
}
function pause() {
  if (mode !== 'playing' && mode !== 'countdown') return
  mode = 'paused'
  accumulator = 0
  element('pause-screen').hidden = false
  element('countdown').hidden = true
  element('resume').focus({ preventScroll: true })
}
function resume() {
  if (mode !== 'paused' || dialog.open) return
  element('pause-screen').hidden = true
  element('countdown').hidden = false
  mode = 'countdown'
  countdownAt = elapsed
  element('countdown').textContent = '3'
  canvas.focus({ preventScroll: true })
}
async function saveScore(payload: NonNullable<typeof savePending>) {
  const status = element('save-status')
  status.textContent = 'Saving score…'
  try {
    await api('/api/scores', payload)
    if (savePending !== payload) return
    savePending = null
    status.textContent = 'Score saved'
  } catch {
    if (savePending !== payload) return
    status.replaceChildren()
    const button = document.createElement('button')
    button.className = 'text-button'
    button.textContent = 'Retry saving score'
    button.onclick = () => {
      void saveScore(payload)
    }
    status.append(button)
  }
}
function finish() {
  mode = 'over'
  stage.classList.remove('in-flight')
  element('hud').hidden = true
  const record = flight.score > best
  best = Math.max(best, flight.score)
  writeLocal('little-wings-best', String(best))
  element('best').textContent = String(best)
  element('result-best').textContent = String(best)
  element('result-score').textContent = String(flight.score)
  element('result-eyebrow').textContent = record
    ? 'A new best'
    : flight.score === 0
      ? 'Another little try?'
      : 'Nice flight'
  element('announcement').textContent =
    `Flight finished. Score ${flight.score}. Personal best ${best}.`
  element('result-screen').hidden = false
  element('again').focus({ preventScroll: true })
  element('save-status').replaceChildren()
  savePending = null
  if (runId) {
    const payload = { id: runId, ticks: flight.tick, inputs: [...inputs] }
    savePending = payload
    void saveScore(payload)
  }
}

let previousY = flight.y,
  previousDistance = flight.distance
let lastPaint = 0
function frame(now: number) {
  const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.08) : 0
  lastFrame = now
  elapsed += delta
  if (mode === 'countdown') {
    const remaining = 3 - Math.floor(elapsed - countdownAt)
    if (remaining <= 0) {
      mode = 'playing'
      accumulator = 0
      element('countdown').hidden = true
    } else element('countdown').textContent = String(remaining)
  }
  if (mode === 'playing') {
    accumulator += delta
    while (accumulator >= STEP && flight.alive) {
      const score = flight.score
      previousY = flight.y
      previousDistance = flight.distance
      step(flight)
      accumulator -= STEP
      if (flight.score !== score) {
        element('score').textContent = String(flight.score)
        pointPop = 1
        sound.play('point')
      }
    }
    if (!flight.alive) {
      mode = 'dying'
      deathAt = elapsed
      impact = 1
      sound.play('hit')
      accumulator = 0
    }
  }
  if (mode === 'dying' && elapsed - deathAt > 0.42) finish()
  if (mode === 'playing' || mode === 'dying') {
    for (const p of particles) {
      p.x += p.vx * delta
      p.y += p.vy * delta
      p.life -= delta * 1.8
    }
    particles = particles.filter((p) => p.life > 0)
  }
  impact = Math.max(0, impact - delta * 3)
  pointPop = Math.max(0, pointPop - delta * 5)
  element('score').style.transform = `scale(${1 + pointPop * 0.12})`
  // A quiet idle scene needs fewer paints; active input stays at display refresh.
  if (
    width > 0 &&
    height > 0 &&
    (mode === 'playing' || mode === 'dying' || now - lastPaint > 32)
  ) {
    const drawFlight =
      mode === 'playing'
        ? {
            ...flight,
            y: previousY + ((flight.y - previousY) * accumulator) / STEP,
            distance:
              previousDistance +
              ((flight.distance - previousDistance) * accumulator) / STEP,
          }
        : flight
    render(ctx, width, height, {
      flight: drawFlight,
      time: reducedMotion && mode === 'idle' ? 0 : elapsed,
      idle: mode === 'idle' || mode === 'starting',
      dead: mode === 'dying' || mode === 'over',
      particles,
      impact,
    })
    lastPaint = now
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

async function showLeaders() {
  if (mode === 'playing' || mode === 'countdown') pause()
  pausedFrom = mode === 'idle' || mode === 'over' ? mode : null
  dialog.showModal()
  const content = element('leader-content')
  content.textContent = 'Loading…'
  content.className = 'leader-content'
  element('leader-account').replaceChildren()
  if (!user && authEnabled) element('leader-account').append(signInLink())
  try {
    const data = await api<{
      entries: { name: string; score: number; isMe: number }[]
      best: number
    }>('/api/leaderboard')
    content.replaceChildren()
    if (!data.entries.length) {
      const empty = document.createElement('div')
      empty.className = 'leader-empty'
      empty.innerHTML = `${icon('trophy')}<p>No flights yet.</p>`
      content.append(empty)
    } else {
      const list = document.createElement('ol')
      list.className = 'leader-list'
      data.entries.forEach((entry, i) => {
        const row = document.createElement('li')
        row.className = entry.isMe ? 'is-me' : ''
        const rank = document.createElement('span')
        rank.className = 'rank'
        rank.textContent = String(i + 1)
        const avatar = document.createElement('span')
        avatar.className = 'avatar'
        avatar.textContent = entry.name.slice(0, 1).toLocaleLowerCase()
        const name = document.createElement('span')
        name.className = 'player-name'
        name.textContent = entry.name
        const score = document.createElement('strong')
        score.textContent = String(entry.score)
        row.append(rank, avatar, name, score)
        list.append(row)
      })
      content.append(list)
    }
    if (user && data.best > best) {
      best = data.best
      writeLocal('little-wings-best', String(best))
      element('best').textContent = String(best)
    }
  } catch {
    content.textContent = ''
    const error = document.createElement('p')
    error.textContent = 'The leaderboard couldn’t connect.'
    const retry = document.createElement('button')
    retry.className = 'text-button'
    retry.textContent = 'Try again'
    retry.onclick = () => {
      void showLeaders()
    }
    content.append(error, retry)
  }
}
function closeLeaders() {
  dialog.close()
  if (pausedFrom === null && mode === 'paused')
    element('resume').focus({ preventScroll: true })
}
element('leaders').onclick = () => {
  void showLeaders()
}
element('close-leaders').onclick = closeLeaders
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect()
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeLeaders()
  }
})
element('start').onclick = () => {
  void start()
}
element('again').onclick = () => {
  void start()
}
element('pause').onclick = pause
element('resume').onclick = resume
element('sound').onclick = () => {
  sound.enabled = !sound.enabled
  writeLocal('little-wings-sound', sound.enabled ? 'on' : 'off')
  sound.unlock()
  updateSound()
  sound.play('point')
}
if (!document.fullscreenEnabled) element('fullscreen').hidden = true
element('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await element('app').requestFullscreen()
  } catch {
    toast('Fullscreen isn’t available in this browser.')
  }
}
document.addEventListener('fullscreenchange', () => {
  element('fullscreen').setAttribute(
    'aria-label',
    document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen',
  )
})
canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return
  event.preventDefault()
  canvas.focus({ preventScroll: true })
  if (mode === 'idle') void start()
  else if (mode === 'playing') doFlap()
})
document.addEventListener('keydown', (event) => {
  if (dialog.open || event.repeat) return
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault()
    if (mode === 'paused') resume()
    else pause()
    return
  }
  if (event.code !== 'Space' && event.code !== 'ArrowUp') return
  if ((event.target as HTMLElement).closest('button, a, input')) return
  event.preventDefault()
  if (mode === 'idle' || mode === 'over') void start()
  else if (mode === 'playing') doFlap()
  else if (mode === 'paused') resume()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause()
  lastFrame = 0
})
window.addEventListener('blur', pause)
