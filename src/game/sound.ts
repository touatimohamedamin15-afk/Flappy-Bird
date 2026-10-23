export class Sound {
  private context: AudioContext | null = null
  enabled = false
  unlock() {
    if (!this.enabled) return
    this.context ??= new AudioContext()
    void this.context.resume().catch(() => {})
  }
  play(kind: 'flap' | 'point' | 'hit') {
    if (!this.enabled) return
    this.unlock()
    const c = this.context
    if (!c || c.state !== 'running') return
    const oscillator = c.createOscillator(),
      gain = c.createGain(),
      now = c.currentTime
    oscillator.connect(gain)
    gain.connect(c.destination)
    oscillator.type = 'sine'
    const duration = kind === 'hit' ? 0.22 : 0.1
    const from = kind === 'flap' ? 510 : kind === 'point' ? 740 : 160
    const to = kind === 'flap' ? 810 : kind === 'point' ? 1120 : 55
    oscillator.frequency.setValueAtTime(from, now)
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(
      kind === 'flap' ? 0.035 : 0.07,
      now + 0.008,
    )
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.01)
  }
}
