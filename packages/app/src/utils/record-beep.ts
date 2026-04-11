// Lightweight recording feedback beeps via Web Audio API.
// No file loading – tones are synthesised on the fly for instant playback.

let ctx: AudioContext | undefined

function audio() {
  if (ctx) return ctx
  ctx = new AudioContext()
  return ctx
}

function beep(freq: number, duration: number, vol = 0.18) {
  try {
    const ac = audio()
    if (ac.state === "suspended") ac.resume()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.value = vol
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
    osc.connect(gain).connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + duration)
  } catch {}
}

/** Short ascending tone – recording started */
export function beepStart() {
  beep(660, 0.12)
  setTimeout(() => beep(880, 0.12), 80)
}

/** Short descending tone – recording stopped */
export function beepStop() {
  beep(880, 0.12)
  setTimeout(() => beep(660, 0.12), 80)
}

// Pre-warm AudioContext on first user gesture so beeps play instantly.
let warmed = false
function warm() {
  if (warmed) return
  warmed = true
  try {
    const ac = audio()
    if (ac.state === "suspended") ac.resume()
  } catch {}
}

if (typeof document !== "undefined") {
  const events = ["click", "touchend", "keydown"] as const
  const handler = () => {
    warm()
    if (warmed) events.forEach((e) => document.removeEventListener(e, handler, true))
  }
  events.forEach((e) => document.addEventListener(e, handler, true))
}
