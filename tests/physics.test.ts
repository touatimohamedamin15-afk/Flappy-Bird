import { describe, expect, test } from 'bun:test'
import { createFlight, flap, step, verifyReplay } from '../src/game/physics'

export function fly(seed: number, points = 8) {
  const f = createFlight(seed),
    inputs: number[] = []
  while (f.alive) {
    const next = f.pipes.find((p) => p.x - f.distance > -50)!
    const target = next.x - f.distance < 220 ? next.center : 300
    if (f.score < points && f.y > target + 17 && f.velocity > -40 && flap(f))
      inputs.push(f.tick)
    step(f)
  }
  return { inputs, ticks: f.tick, score: f.score }
}
describe('flight physics', () => {
  test('the same seed and inputs replay exactly, including a scored flight', () => {
    const run = fly(7421)
    expect(run.score).toBeGreaterThanOrEqual(8)
    expect(verifyReplay(7421, run.ticks, run.inputs)).toEqual({
      score: run.score,
      ticks: run.ticks,
    })
  })
  test('falling and flying into the ceiling both end a flight', () => {
    const falling = createFlight(1)
    while (falling.alive) step(falling)
    expect(falling.score).toBe(0)
    const rising = createFlight(1)
    while (rising.alive) {
      flap(rising)
      step(rising)
    }
    expect(rising.y).toBeLessThan(13)
  })
  test('rejects unfinished, extended, out-of-order and oversized replays', () => {
    const run = fly(1)
    expect(verifyReplay(1, 1, [])).toBeNull()
    expect(verifyReplay(1, run.ticks + 1, run.inputs)).toBeNull()
    expect(verifyReplay(1, run.ticks, [10, 2])).toBeNull()
    expect(verifyReplay(1, run.ticks, [0, 1])).toBeNull()
    expect(verifyReplay(1, Infinity, [])).toBeNull()
    expect(verifyReplay(1, 100, Array(5000).fill(1))).toBeNull()
  })
  test('collision applies at pipe edges', () => {
    const f = createFlight(2)
    f.pipes[0].x = 0
    f.y = f.pipes[0].center - f.pipes[0].gap / 2 - 10
    step(f)
    expect(f.alive).toBe(false)
  })
  test('draw frame groupings do not alter the fixed-step result', () => {
    const a = createFlight(90),
      b = createFlight(90)
    for (let frame = 0; frame < 300 && a.alive; frame++) {
      if (a.tick % 60 === 0) flap(a)
      step(a)
    }
    for (let frame = 0; frame < 100 && b.alive; frame++) {
      for (let tick = 0; tick < 3 && b.alive; tick++) {
        if (b.tick % 60 === 0) flap(b)
        step(b)
      }
    }
    expect(a).toEqual(b)
  })
})
