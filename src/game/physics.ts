// Shared with the Worker: the canvas frame rate never changes the simulation.
export const STEP = 1 / 120
export const HEIGHT = 640
export const FLOOR = 584
export const RADIUS = 13
export const PIPE_WIDTH = 78
export const MAX_TICKS = 120 * 60 * 6
export const MIN_FLAP_TICKS = 9
export type Pipe = { x: number; center: number; gap: number; passed: boolean }
export type Flight = {
  y: number
  velocity: number
  distance: number
  tick: number
  score: number
  alive: boolean
  pipes: Pipe[]
  random: number
  lastFlap: number
  nextPipe: number
}

export function createFlight(seed: number): Flight {
  const flight: Flight = {
    y: 290,
    velocity: 0,
    distance: 0,
    tick: 0,
    score: 0,
    alive: true,
    pipes: [],
    random: seed >>> 0,
    lastFlap: -MIN_FLAP_TICKS,
    nextPipe: 480,
  }
  for (let i = 0; i < 7; i++) addPipe(flight)
  return flight
}

function addPipe(flight: Flight) {
  flight.random = (Math.imul(1664525, flight.random) + 1013904223) >>> 0
  const previous = flight.pipes.at(-1)?.center ?? 300
  const center = Math.max(
    172,
    Math.min(416, previous + (flight.random / 4294967296 - 0.5) * 170),
  )
  flight.pipes.push({
    x: flight.nextPipe,
    center,
    gap: Math.max(176, 198 - flight.score * 0.55),
    passed: false,
  })
  flight.nextPipe += 282
}

export function flap(flight: Flight): boolean {
  if (!flight.alive || flight.tick - flight.lastFlap < MIN_FLAP_TICKS)
    return false
  flight.velocity = -346
  flight.lastFlap = flight.tick
  return true
}

export function step(flight: Flight): void {
  if (!flight.alive) return
  flight.tick++
  flight.velocity = Math.min(650, flight.velocity + 1040 * STEP)
  flight.y += flight.velocity * STEP
  flight.distance += (174 + Math.min(28, flight.score * 0.7)) * STEP
  if (
    flight.y - RADIUS < 0 ||
    flight.y + RADIUS >= FLOOR ||
    flight.tick >= MAX_TICKS
  ) {
    flight.alive = false
    return
  }
  for (const pipe of flight.pipes) {
    const x = pipe.x - flight.distance
    // Circle versus each pipe rectangle, including its slightly wider rim.
    const dx = Math.max(Math.abs(x) - PIPE_WIDTH / 2, 0)
    const top = pipe.center - pipe.gap / 2
    const bottom = pipe.center + pipe.gap / 2
    if (
      dx * dx + Math.max(flight.y - top, 0) ** 2 < RADIUS ** 2 ||
      dx * dx + Math.max(bottom - flight.y, 0) ** 2 < RADIUS ** 2
    ) {
      flight.alive = false
      return
    }
    if (!pipe.passed && x + PIPE_WIDTH / 2 < -RADIUS) {
      pipe.passed = true
      flight.score++
    }
  }
  if (flight.pipes[0].x < flight.distance - 700) {
    flight.pipes.shift()
    addPipe(flight)
  }
}

export function verifyReplay(
  seed: number,
  ticks: unknown,
  inputs: unknown,
): { score: number; ticks: number } | null {
  if (
    !Number.isInteger(ticks) ||
    (ticks as number) < 1 ||
    (ticks as number) > MAX_TICKS ||
    !Array.isArray(inputs) ||
    inputs.length > 4800
  )
    return null
  let previous = -MIN_FLAP_TICKS
  for (const input of inputs) {
    if (
      !Number.isInteger(input) ||
      input < 0 ||
      input >= (ticks as number) ||
      input - previous < MIN_FLAP_TICKS
    )
      return null
    previous = input
  }
  const flight = createFlight(seed)
  let index = 0
  while (flight.tick < (ticks as number) && flight.alive) {
    if (inputs[index] === flight.tick) {
      flap(flight)
      index++
    }
    step(flight)
  }
  if (flight.alive || flight.tick !== ticks || index !== inputs.length)
    return null
  return { score: flight.score, ticks: flight.tick }
}
