import { FLOOR, HEIGHT, PIPE_WIDTH, type Flight } from './physics'

export type Scene = {
  flight: Flight
  time: number
  idle: boolean
  dead: boolean
  impact: number
  particles: { x: number; y: number; life: number; vx: number; vy: number }[]
}
const TAU = Math.PI * 2
function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient,
) {
  c.fillStyle = color
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, TAU)
  c.fill()
}
function round(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath()
  c.roundRect(x, y, w, h, r)
}

export function drawBird(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  time: number,
  scale = 1,
  dead = false,
) {
  c.save()
  c.translate(x, y)
  c.rotate(angle)
  c.scale(scale, scale)
  // Three small tail feathers, rounded silhouette and a warm belly.
  c.fillStyle = '#ad4e3e'
  c.beginPath()
  c.moveTo(-16, -3)
  c.quadraticCurveTo(-37, -13, -30, -1)
  c.lineTo(-21, 12)
  c.lineTo(-10, 10)
  c.fill()
  const body = c.createLinearGradient(-12, -19, 15, 18)
  body.addColorStop(0, '#f4936c')
  body.addColorStop(1, '#d5654f')
  ellipse(c, 0, 0, 24, 19, body)
  ellipse(c, 8, 8, 14, 10, '#ffe6b7')
  c.fillStyle = '#e8b05a'
  c.beginPath()
  c.moveTo(20, 0)
  c.quadraticCurveTo(38, 5, 25, 10)
  c.lineTo(18, 9)
  c.fill()
  c.strokeStyle = '#cc9140'
  c.lineWidth = 1.2
  c.beginPath()
  c.moveTo(23, 5)
  c.lineTo(31, 5)
  c.stroke()
  c.save()
  c.translate(-8, 4)
  c.rotate(-0.3 + Math.sin(time * 24) * (dead ? 0 : 0.5))
  ellipse(c, -3, 3, 11, 6, '#bf5645')
  c.strokeStyle = '#e48564'
  c.beginPath()
  c.ellipse(-4, 1, 8, 4, 0.1, 3.2, 5.8)
  c.stroke()
  c.restore()
  ellipse(c, 12, -6, 4.6, 5.4, '#fff6de')
  if (dead) {
    c.strokeStyle = '#343f34'
    c.lineWidth = 1.8
    c.beginPath()
    c.moveTo(10, -8)
    c.lineTo(14, -4)
    c.moveTo(14, -8)
    c.lineTo(10, -4)
    c.stroke()
  } else {
    ellipse(c, 13.4, -5.5, 2.5, 3.4, '#303e32')
    ellipse(c, 14.3, -7, 0.8, 1, '#fffdf2')
  }
  c.strokeStyle = '#f9b48b'
  c.lineWidth = 2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-4, -15)
  c.quadraticCurveTo(2, -18, 6, -15)
  c.stroke()
  c.restore()
}

function cloud(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
) {
  c.save()
  c.translate(x, y)
  c.scale(size, size)
  c.globalAlpha = opacity
  c.fillStyle = '#fffcf0'
  c.beginPath()
  c.moveTo(-50, 14)
  c.bezierCurveTo(-65, 13, -62, -10, -40, -12)
  c.bezierCurveTo(-39, -42, 4, -45, 14, -20)
  c.bezierCurveTo(35, -26, 50, -7, 43, 3)
  c.bezierCurveTo(66, 0, 68, 22, 45, 22)
  c.lineTo(-42, 22)
  c.quadraticCurveTo(-54, 21, -50, 14)
  c.fill()
  c.restore()
}

function hills(
  c: CanvasRenderingContext2D,
  width: number,
  offset: number,
  y: number,
  color: string,
  period: number,
  height: number,
) {
  c.fillStyle = color
  c.beginPath()
  c.moveTo(-period, HEIGHT)
  const start = -(offset % period) - period
  c.lineTo(start, y)
  for (let x = start; x < width + period; x += period) {
    c.bezierCurveTo(
      x + period * 0.2,
      y,
      x + period * 0.22,
      y - height,
      x + period * 0.5,
      y - height,
    )
    c.bezierCurveTo(
      x + period * 0.78,
      y - height,
      x + period * 0.8,
      y,
      x + period,
      y,
    )
  }
  c.lineTo(width + period, HEIGHT)
  c.closePath()
  c.fill()
}

function pipe(
  c: CanvasRenderingContext2D,
  x: number,
  edge: number,
  top: boolean,
) {
  const w = PIPE_WIDTH - 10,
    start = top ? -25 : edge,
    end = top ? edge : FLOOR + 10
  const grad = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
  grad.addColorStop(0, '#668754')
  grad.addColorStop(0.2, '#9eb975')
  grad.addColorStop(0.38, '#abc47e')
  grad.addColorStop(0.75, '#83a263')
  grad.addColorStop(1, '#5c7e50')
  c.fillStyle = '#567249'
  round(c, x - w / 2 - 1.5, start, w + 3, end - start, 7)
  c.fill()
  c.fillStyle = grad
  round(c, x - w / 2, start, w, end - start, 6)
  c.fill()
  c.fillStyle = '#d0dda2'
  c.globalAlpha = 0.35
  round(c, x - w / 2 + 9, start + 4, 4, end - start - 8, 2)
  c.fill()
  c.globalAlpha = 1
  const capY = top ? edge - 27 : edge
  c.fillStyle = '#58764b'
  round(c, x - PIPE_WIDTH / 2, capY, PIPE_WIDTH, 28, 8)
  c.fill()
  c.fillStyle = grad
  round(c, x - PIPE_WIDTH / 2 + 1.5, capY + 1.5, PIPE_WIDTH - 3, 24, 7)
  c.fill()
  c.fillStyle = '#c5d69b'
  round(c, x - PIPE_WIDTH / 2 + 5, capY + 3, PIPE_WIDTH - 10, 3, 2)
  c.fill()
  c.fillStyle = '#4d7046'
  c.globalAlpha = 0.35
  round(c, x - PIPE_WIDTH / 2 + 4, capY + 22, PIPE_WIDTH - 8, 3, 2)
  c.fill()
  c.globalAlpha = 1
  // Tiny climbing leaf: restrained detail, away from the collision edge.
  if (!top) {
    c.strokeStyle = '#52784a'
    c.lineWidth = 1.5
    c.beginPath()
    c.moveTo(x + 31, edge + 87)
    c.quadraticCurveTo(x + 38, edge + 64, x + 47, edge + 66)
    c.stroke()
    c.fillStyle = '#789753'
    c.beginPath()
    c.moveTo(x + 37, edge + 76)
    c.quadraticCurveTo(x + 31, edge + 54, x + 51, edge + 60)
    c.quadraticCurveTo(x + 52, edge + 73, x + 37, edge + 76)
    c.fill()
  }
}

export function render(
  c: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
) {
  const scale = height / HEIGHT,
    w = width / scale
  c.save()
  c.scale(scale, scale)
  const { flight, time, idle } = scene
  const travel = idle ? time * 19 : flight.distance
  const birdX = idle ? w * 0.5 : Math.min(w * 0.3, 350)
  const sky = c.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, '#edecda')
  sky.addColorStop(0.55, '#e5ebd7')
  sky.addColorStop(1, '#c5d9bc')
  c.fillStyle = sky
  c.fillRect(0, 0, w, HEIGHT)
  const sunX = w * 0.78,
    sunY = 115
  const halo = c.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150)
  halo.addColorStop(0, '#fff6cfbb')
  halo.addColorStop(1, '#fff4ce00')
  c.fillStyle = halo
  c.fillRect(sunX - 150, sunY - 150, 300, 300)
  ellipse(c, sunX, sunY, 38, 38, '#fff8db')
  for (let i = 0; i < 7; i++) {
    const x =
      ((((i * 287 + 80 - travel * 0.15) % (w + 300)) + w + 300) % (w + 300)) -
      150
    cloud(c, x, 100 + ((i * 61) % 170), 0.65 + (i % 3) * 0.3, 0.65)
  }
  // A few distant migrating birds.
  c.strokeStyle = '#879985'
  c.lineWidth = 1.4
  c.globalAlpha = 0.6
  for (let i = 0; i < 3; i++) {
    const x = w * 0.65 + i * 19 - travel * 0.025,
      y = 225 + (i % 2) * 9
    c.beginPath()
    c.moveTo(x - 4, y + 2)
    c.quadraticCurveTo(x - 2, y - 2, x, y)
    c.quadraticCurveTo(x + 2, y - 2, x + 5, y + 1)
    c.stroke()
  }
  c.globalAlpha = 1
  hills(c, w, travel * 0.12, 478, '#c1d2b5', 620, 160)
  hills(c, w, travel * 0.23 + 170, 530, '#a6c09e', 470, 128)
  hills(c, w, travel * 0.38 + 80, 571, '#87ad8a', 350, 100)
  // Soft tree line and scattered foliage.
  for (let i = 0; i < Math.ceil(w / 82) + 3; i++) {
    const x = i * 82 - ((travel * 0.55) % 82),
      h = 23 + ((i + Math.floor((travel * 0.55) / 82)) % 3) * 15
    c.fillStyle = '#749f7c'
    c.beginPath()
    c.moveTo(x, 570)
    c.lineTo(x + 16, 570 - h)
    c.lineTo(x + 32, 570)
    c.fill()
  }
  if (idle) {
    const x = w < 650 ? w + 10 : w * 0.84
    pipe(c, x, 223, true)
    pipe(c, x, 430, false)
    if (w > 850) {
      pipe(c, w * 0.12 - 15, 110, true)
      pipe(c, w * 0.12 - 15, 393, false)
    }
  } else {
    for (const p of flight.pipes) {
      const x = birdX + p.x - flight.distance
      if (x < -70 || x > w + 70) continue
      pipe(c, x, p.center - p.gap / 2, true)
      pipe(c, x, p.center + p.gap / 2, false)
    }
  }
  // Ground never moves vertically; parallax is drawn inside the same canvas.
  c.fillStyle = '#6f9060'
  c.fillRect(0, FLOOR, w, 56)
  c.fillStyle = '#a9b77b'
  c.fillRect(0, FLOOR + 3, w, 8)
  c.fillStyle = '#ddd7ad'
  c.fillRect(0, FLOOR + 11, w, 45)
  c.fillStyle = '#cbc69c'
  c.fillRect(0, FLOOR + 13, w, 3)
  for (let i = 0; i < w / 30 + 2; i++) {
    const x = i * 30 - (travel % 30)
    c.fillStyle = '#ebe4bd'
    round(
      c,
      x,
      FLOOR + 26 + ((i + Math.floor(travel / 30)) % 2) * 11,
      10,
      3,
      1.5,
    )
    c.fill()
  }
  for (let i = 0; i < w / 78 + 2; i++) {
    const x = i * 78 - (travel % 78)
    c.strokeStyle = '#739458'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(x, FLOOR + 2)
    c.lineTo(x - 3, FLOOR - 4)
    c.moveTo(x, FLOOR + 2)
    c.lineTo(x + 4, FLOOR - 6)
    c.stroke()
    if ((i + Math.floor(travel / 78)) % 3 === 1) {
      ellipse(c, x + 13, FLOOR - 3, 2.5, 2.5, '#f5e4af')
    }
  }
  if (!idle) {
    for (const p of scene.particles) {
      c.globalAlpha = Math.max(0, p.life)
      ellipse(
        c,
        birdX + p.x - flight.distance,
        p.y,
        2.8 * p.life,
        2.8 * p.life,
        '#fff2ce',
      )
    }
    c.globalAlpha = 1
  }
  const y = idle ? 324 + Math.sin(time * 2.8) * 9 : flight.y
  ellipse(c, birdX, FLOOR + 5, 23, 4, '#46673c22')
  const angle = idle
    ? -0.08
    : Math.max(-0.4, Math.min(1.3, flight.velocity / 550))
  drawBird(c, birdX, y, angle, time, idle ? 1.8 : 1, scene.dead)
  if (scene.impact > 0) {
    c.fillStyle = `rgba(255,248,222,${scene.impact * 0.3})`
    c.fillRect(0, 0, w, HEIGHT)
  }
  c.restore()
}
