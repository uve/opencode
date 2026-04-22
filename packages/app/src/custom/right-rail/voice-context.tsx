import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { useServer } from "@/context/server"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useGlobalSync } from "@/context/global-sync"
import { useLocal } from "@/context/local"
import { useLayout } from "@/context/layout"
import { usePrompt } from "@/context/prompt"
import { formatServerError } from "@/utils/server-errors"
import { beepStart, beepStop } from "@/utils/record-beep"
import { getVoiceStatus, type VoiceStatus } from "./voice-state"
import { sendFollowupDraft } from "@/components/prompt-input/submit"
import type { TextPart } from "@opencode-ai/sdk/v2/client"
import { Identifier } from "@/utils/id"

/** Noop voice API returned when init fails — app keeps working */
const NOOP_MEMO = () => false as const
const NOOP_STATUS = () => "idle" as VoiceStatus
const noop = {
  stream: {
    active: NOOP_MEMO,
    recording: NOOP_MEMO,
    paused: NOOP_MEMO,
    activate() {},
    deactivate() {},
    toggle() {},
    pause() {},
    resume() {},
  },
  recorder: {
    status: NOOP_STATUS,
    recording: NOOP_MEMO,
    transcribing: NOOP_MEMO,
    cooldown: NOOP_MEMO,
    toggle: async () => {},
    cancel: () => false,
    queueNavigation: (_url: string) => {},
    cancelPendingNavigation: () => {},
  },
  tts: {
    speaking: NOOP_MEMO,
    stop() {},
  },
}

export const { use: useVoice, provider: VoiceProvider } = createSimpleContext({
  name: "Voice",
  gate: false,
  init: () => {
    try {
      return initVoice()
    } catch (err) {
      console.error("[VoiceProvider] init failed, voice disabled:", err)
      return noop
    }
  },
})

interface CapturedSession {
  id: string
  directory: string
  prompt: string
}

function initVoice() {
  const params = useParams()
  const navigate = useNavigate()
  const language = useLanguage()
  const prompt = usePrompt()
  const layout = useLayout()
  const sdk = useSDK()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const local = useLocal()
  const settings = useSettings()
  const server = useServer()

  // ─── Reactive state ─────────────────────────────────────────
  const [store, setStore] = createStore({
    stream: { active: false, paused: false },
    recorder: { recording: false, transcribing: false, cooldown: false },
    tts: { speaking: false },
  })

  // ─── Instance refs (closure-scoped, NOT module-level) ───────
  let rtc: { pc: RTCPeerConnection; dc: RTCDataChannel; stream: MediaStream } | undefined
  let captured: CapturedSession | undefined
  let mediaRecorder: MediaRecorder | undefined
  let chunks: Blob[] = []
  let cancelled = false
  let abortCtrl: AbortController | undefined
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined

  // ─── Cross-tab sync via BroadcastChannel + Web Locks ────────
  // Leader tab owns RTC. Followers mirror state. When leader closes,
  // navigator.locks auto-releases the lock and the next tab in queue
  // becomes leader (getUserMedia perm is remembered per-origin).
  // Transcription is applied only by the tab with OS focus.
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("voice-stream") : undefined
  let isLeader = false
  let leaderAbort: AbortController | undefined
  let leaderRelease: (() => void) | undefined
  const focused = () => (typeof document !== "undefined" ? document.hasFocus() : true)

  // ─── Persist stream-active across tab switches and page reloads ──
  // sessionStorage (not localStorage): voice does NOT auto-resume after the
  // browser is fully closed and reopened (avoids surprising mic activation),
  // but does resume across reloads and route changes within the same session.
  const STREAM_PERSIST_KEY = "opencode-voice-stream-active"
  const persistStreamState = (active: boolean) => {
    try {
      if (typeof sessionStorage === "undefined") return
      if (active) sessionStorage.setItem(STREAM_PERSIST_KEY, "1")
      else sessionStorage.removeItem(STREAM_PERSIST_KEY)
    } catch {}
  }
  const wasStreamActive = (() => {
    try {
      return typeof sessionStorage !== "undefined" && sessionStorage.getItem(STREAM_PERSIST_KEY) === "1"
    } catch {
      return false
    }
  })()

  // ─── TTS refs ───────────────────────────────────────────────
  const [ttsTarget, setTtsTarget] = createSignal<string | undefined>()

  // ─── Helpers ────────────────────────────────────────────────

  const readPrompt = () =>
    prompt
      .current()
      .map((p) => ("content" in p ? p.content : ""))
      .join("")
      .trim()

  const writePrompt = (text: string) => {
    prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
  }

  /** Snapshot current session so sends go here even after tab switch. */
  const captureSession = (): CapturedSession | undefined => {
    const id = params.id
    if (!id) return undefined
    captured = { id, directory: sdk.directory, prompt: readPrompt() }
    return captured
  }

  /** Send text to the CAPTURED session (not current params). */
  const send = (text: string) => {
    const next = text.trim()
    if (!next) return

    const model = local.model.current()
    const agent = local.agent.current()
    const variant = local.model.variant.current()
    if (!model || !agent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    const session = captured ?? (params.id ? { id: params.id, directory: sdk.directory, prompt: "" } : undefined)
    const background = captured && captured.id !== params.id

    // Mark session for TTS when voice mode (stream) is active
    if (store.stream.active && session) {
      console.log("[TTS] marking session for TTS:", session.id)
      setTtsTarget(session.id)
    }

    if (!session) {
      writePrompt(next)
      requestAnimationFrame(() => {
        const form = document.querySelector<HTMLFormElement>('[data-dock-surface="shell"]')
        if (form) form.requestSubmit()
      })
      return
    }

    // Only reset prompt if sending to the currently visible session
    if (!background) prompt.reset()

    void sendFollowupDraft({
      client: sdk.client,
      sync,
      globalSync,
      draft: {
        sessionID: session.id,
        sessionDirectory: session.directory,
        prompt: [{ type: "text", content: next, start: 0, end: next.length }],
        context: [],
        agent: agent.name,
        model: { providerID: model.provider.id, modelID: model.id },
        variant,
      },
      messageID: Identifier.ascending("message"),
      optimisticBusy: true,
    }).catch((err) => {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: formatServerError(err, language.t, language.t("common.requestFailed")),
      })
    })
  }

  // ─── Stream mode (Web Speech API) ───────────────────────────
  // Simple: activate → everything spoken goes to input immediately.
  // Say "отправить"/"send" → input is sent, input cleared, keeps listening.
  // Never stops until user deactivates.

  const CMDS = new Set(["отправить", "send", "стоп", "stop", "старт", "start"])

  const normalize = (t: string) =>
    t
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:]+$/, "")
      .trim()

  const isSend = (t: string) => {
    const w = normalize(t)
    const words = w.split(/\s+/)
    const tail = words[words.length - 1] || ""
    return { match: tail === "отправить" || tail === "send", body: words.slice(0, -1).join(" ") }
  }

  const streamSubmit = () => {
    const text = readPrompt()
    if (text) {
      captureSession()
      send(text)
      captured = undefined
    }
  }

  const isStop = (t: string) => {
    const w = normalize(t).split(/\s+/)
    const tail = w[w.length - 1] || ""
    return tail === "стоп" || tail === "stop"
  }

  const isStart = (t: string) => {
    const w = normalize(t).split(/\s+/)
    const head = w[0] || ""
    return { match: head === "старт" || head === "start", body: w.slice(1).join(" ") }
  }

  const onFinal = (raw: string) => {
    console.log("[StreamMode] onFinal:", raw)

    // "стоп"/"stop" — stop TTS playback
    if (isStop(raw)) {
      console.log("[Voice] stop command — stopping TTS")
      stopTts()
      return
    }

    // "старт"/"start" as first word — clear input, keep rest
    const start = isStart(raw)
    if (start.match) {
      console.log("[Voice] start command — clearing input")
      writePrompt(start.body)
      return
    }

    const cmd = isSend(raw)
    if (cmd.match) {
      // Append any text before "отправить", then send
      if (cmd.body) {
        const existing = readPrompt()
        const next = existing ? `${existing} ${cmd.body}` : cmd.body
        writePrompt(next)
      }
      streamSubmit()
      return
    }

    // Append recognized text to input
    const text = raw.replace(/\s+/g, " ").trim()
    if (!text) return
    const existing = readPrompt()
    const next = existing ? `${existing} ${text}` : text
    writePrompt(next)
  }

  // ─── Shared transcription handlers ───────────────────────────

  const handleFinal = (finalText: string) => {
    console.log("[Voice] processing final:", JSON.stringify(finalText))
    onFinal(finalText)
  }

  // ─── Engine: OpenAI Realtime Transcription ──────────────────

  const startRealtime = async () => {
    const tokenRes = await fetch(`${sdk.url}/experimental/realtime/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...auth() },
      body: JSON.stringify({}),
    })
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}: ${await tokenRes.text()}`)
    const session = (await tokenRes.json()) as any
    const secret = session?.client_secret?.value
    if (!secret) throw new Error("no client_secret")

    const pc = new RTCPeerConnection()
    pc.ontrack = () => {}

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const t of stream.getTracks()) pc.addTrack(t, stream)

    const dc = pc.createDataChannel("oai-events")
    dc.onmessage = (ev) => {
      let msg: any
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      // Only use final (completed) transcriptions — more accurate
      if (msg.type === "conversation.item.input_audio_transcription.completed") {
        const text: string = msg.transcript ?? ""
        if (!text.trim()) return
        channel?.postMessage({ type: "final", text })
        if (focused()) handleFinal(text)
        return
      }
      if (msg.type === "error") {
        console.error("[Voice/Realtime] error", msg)
        showToast({
          variant: "error",
          title: "Realtime error",
          description: msg.error?.message ?? "unknown",
        })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const sdpRes = await fetch(`https://api.openai.com/v1/realtime?intent=transcription`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    })
    if (!sdpRes.ok) {
      stream.getTracks().forEach((t) => t.stop())
      pc.close()
      throw new Error(`sdp ${sdpRes.status}: ${await sdpRes.text()}`)
    }
    await pc.setRemoteDescription({ type: "answer" as const, sdp: await sdpRes.text() })
    rtc = { pc, dc, stream }
  }

  const stopRealtime = () => {
    if (!rtc) return
    try {
      rtc.dc.close()
    } catch {}
    try {
      rtc.pc.close()
    } catch {}
    for (const t of rtc.stream.getTracks()) t.stop()
    rtc = undefined
  }

  const pauseRealtime = () => {
    if (!rtc) return
    for (const t of rtc.stream.getTracks()) t.enabled = false
  }

  const resumeRealtime = () => {
    if (!rtc) return
    for (const t of rtc.stream.getTracks()) t.enabled = true
  }

  // ─── Stream mode public API (engine-agnostic) ───────────────

  /** Queue for the voice-leader lock. When acquired, start RTC and hold. */
  const tryBecomeLeader = () => {
    if (isLeader || leaderAbort) return
    if (typeof navigator === "undefined" || !navigator.locks) return
    const ac = new AbortController()
    leaderAbort = ac
    navigator.locks
      .request("opencode-voice-leader", { signal: ac.signal }, async () => {
        if (ac.signal.aborted || !store.stream.active) return
        isLeader = true
        console.log("[Voice] acquired leader lock")
        channel?.postMessage({ type: "state", active: true, paused: store.stream.paused })
        try {
          await startRealtime()
          // Hold the lock while leader is alive
          await new Promise<void>((res) => {
            leaderRelease = res
          })
        } finally {
          stopRealtime()
          isLeader = false
          leaderRelease = undefined
          console.log("[Voice] released leader lock")
        }
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        console.error("[Voice] lock request failed:", err)
      })
      .finally(() => {
        if (leaderAbort === ac) leaderAbort = undefined
      })
  }

  const cancelLeader = () => {
    if (leaderRelease) {
      const r = leaderRelease
      leaderRelease = undefined
      r()
    }
    leaderAbort?.abort()
    leaderAbort = undefined
  }

  const streamActivate = async () => {
    unlockAudio()
    if (store.stream.active) return
    setStore("stream", { active: true, paused: false })
    persistStreamState(true)
    channel?.postMessage({ type: "state", active: true, paused: false })
    tryBecomeLeader()
  }

  const streamDeactivate = () => {
    channel?.postMessage({ type: "deactivate" })
    setStore("stream", { active: false, paused: false })
    persistStreamState(false)
    cancelLeader()
  }

  const streamToggle = () => {
    console.log("[Voice] streamToggle — active:", store.stream.active, "leader:", isLeader)
    if (!store.stream.active) {
      void streamActivate()
      return
    }
    streamDeactivate()
  }

  // ─── Pending navigation queue ───────────────────────────────
  // When a tab is clicked while transcription is in flight, navigation is
  // deferred until transcribe completes (so the captured speech is sent to
  // the originating session before we leave it). Last-click wins.
  let pendingNavUrl: string | undefined
  function queueNavigation(url: string) {
    pendingNavUrl = url
  }
  function cancelPendingNavigation() {
    pendingNavUrl = undefined
  }
  // Watch transcribing → false transition; if a pending nav is queued, fire it.
  createEffect(
    on(
      () => store.recorder.transcribing,
      (now, prev) => {
        if (prev !== true || now !== false) return
        const url = pendingNavUrl
        if (!url) return
        // Tiny delay so send() inside transcribe-finalize can dispatch first.
        setTimeout(() => {
          const url2 = pendingNavUrl
          pendingNavUrl = undefined
          if (url2) {
            console.log("[Voice] firing deferred navigation to", url2)
            navigate(url2)
          }
        }, 150)
      },
      { defer: true },
    ),
  )

  const streamPause = () => {
    if (store.stream.paused) return
    if (!store.stream.active) return
    setStore("stream", "paused", true)
    channel?.postMessage({ type: "state", active: true, paused: true })
    if (isLeader) pauseRealtime()
  }

  const streamResume = () => {
    if (!store.stream.paused) return
    setStore("stream", "paused", false)
    if (!store.stream.active) return
    channel?.postMessage({ type: "state", active: true, paused: false })
    if (isLeader) resumeRealtime()
  }

  // ─── Handle cross-tab messages ──────────────────────────────
  if (channel) {
    channel.onmessage = (ev) => {
      const msg = ev.data
      if (!msg || typeof msg !== "object") return
      if (msg.type === "state") {
        setStore("stream", { active: !!msg.active, paused: !!msg.paused })
        if (!msg.active) {
          cancelLeader()
        } else {
          // Queue for succession in case current leader dies
          tryBecomeLeader()
        }
        return
      }
      if (msg.type === "final") {
        if (!isLeader && focused()) handleFinal(String(msg.text ?? ""))
        return
      }
      if (msg.type === "deactivate") {
        setStore("stream", { active: false, paused: false })
        cancelLeader()
        return
      }
      if (msg.type === "hello") {
        if (isLeader) {
          channel.postMessage({ type: "state", active: true, paused: store.stream.paused })
        }
        return
      }
    }
    channel.postMessage({ type: "hello" })
  }

  // Stream mode is opt-in: user clicks the headphones button to activate.
  // No auto-activation — avoids infinite error loops on browsers
  // where Web Speech API is blocked (Edge CSP, network errors).
  onCleanup(() => {
    streamDeactivate()
    channel?.close()
  })

  // Auto-restore stream state from sessionStorage. This makes voice mode
  // "sticky" across reloads and route changes within the same browser session.
  onMount(() => {
    if (wasStreamActive && !store.stream.active) {
      console.log("[Voice] auto-restoring stream from sessionStorage")
      void streamActivate()
    }
  })

  // Defensive: when params.id changes and stream is active, log so we know
  // the voice context survived the route transition. send() already uses
  // params.id dynamically, so transcripts naturally route to current session.
  // Also clear `captured` if it points to a session we are no longer on AND
  // there is no recording/transcribing in flight — prevents stale capture
  // from sending stream speech to the wrong session.
  createEffect(
    on(
      () => params.id,
      (id, prev) => {
        if (prev === undefined || id === prev) return
        if (!store.stream.active) return
        const inFlight = store.recorder.recording || store.recorder.transcribing
        if (!inFlight && captured && captured.id !== id) {
          console.log("[Voice] tab switched, clearing stale captured session", captured.id, "→", id)
          captured = undefined
        }
      },
      { defer: true },
    ),
  )

  // ─── Global shortcuts: Enter → record, Esc → cancel, Mouse4 → record ─

  const recorderActive = () => getVoiceStatus(store.recorder) !== "idle"

  /** Cancel current recording without transcribing/sending. */
  const recorderCancel = () => {
    if (store.recorder.recording && mediaRecorder) {
      cancelled = true
      try {
        mediaRecorder.stop()
      } catch {}
      beepStop()
      startCooldown()
      return true
    }
    if (store.recorder.transcribing) {
      abortCtrl?.abort()
      abortCtrl = undefined
      setStore("recorder", "transcribing", false)
      captured = undefined
      startCooldown()
      return true
    }
    return false
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && recorderActive()) {
      e.preventDefault()
      recorderCancel()
      return
    }
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
    const el = document.activeElement
    // Allow Enter when prompt is collapsed even if contentEditable is focused
    const collapsed = layout.prompt.collapsed()
    if (
      !collapsed &&
      el instanceof HTMLElement &&
      (el.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) ||
        el.closest('[role="dialog"], [role="alertdialog"], [data-component="command"]'))
    )
      return
    if (
      el instanceof HTMLElement &&
      !el.isContentEditable &&
      el.closest('[role="dialog"], [role="alertdialog"], [data-component="command"]')
    )
      return
    if (!recorderActive()) {
      const empty = prompt.current().every((p) => !("content" in p) || !p.content.trim())
      if (!collapsed && !empty) return
    }
    e.preventDefault()
    void recorderToggle()
  }

  const onMouse = (e: MouseEvent) => {
    if (e.button !== 3) return
    e.preventDefault()
    if (!recorderActive()) streamPause()
    void recorderToggle()
  }

  onMount(() => {
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("mousedown", onMouse)
  })
  onCleanup(() => {
    document.removeEventListener("keydown", onKey, true)
    document.removeEventListener("mousedown", onMouse)
  })

  // ─── Recorder mode (MediaRecorder + Whisper) ────────────────

  const auth = (): Record<string, string> => {
    const http = server.current?.http
    if (!http?.password) return {}
    return { Authorization: `Basic ${btoa(`${http.username ?? "opencode"}:${http.password}`)}` }
  }

  const COOLDOWN_MS = 2000

  const startCooldown = () => {
    setStore("recorder", "cooldown", true)
    if (cooldownTimer) clearTimeout(cooldownTimer)
    cooldownTimer = setTimeout(() => {
      setStore("recorder", "cooldown", false)
      cooldownTimer = undefined
    }, COOLDOWN_MS)
  }

  const recorderToggle = async () => {
    // ── Double-tap protection: 2s cooldown after ANY press ──
    if (store.recorder.cooldown) return

    if (store.recorder.recording) {
      cancelled = false
      mediaRecorder?.stop()
      beepStop()
      startCooldown()
      return
    }
    if (store.recorder.transcribing) {
      abortCtrl?.abort()
      abortCtrl = undefined
      setStore("recorder", "transcribing", false)
      startCooldown()
      return
    }

    // Cooldown starts immediately — blocks double-tap on start too
    startCooldown()
    cancelled = false

    // ── Capture session BEFORE recording starts ──
    captureSession()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Pick a mimeType that BOTH the browser's MediaRecorder and OpenAI
      // Whisper accept. Firefox defaults to "audio/ogg; codecs=opus";
      // Chrome/Edge default to "audio/webm; codecs=opus"; Safari does mp4.
      // We try in Whisper-supported priority order and fall back to the
      // browser default (undefined constructor arg).
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
      ]
      const preferred = candidates.find((t) => {
        try {
          return typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t)
        } catch {
          return false
        }
      })
      const mr = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      chunks = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mr.onstop = async () => {
        mediaRecorder = undefined
        stream.getTracks().forEach((t) => t.stop())
        setStore("recorder", "recording", false)

        if (cancelled) {
          chunks = []
          captured = undefined
          cancelled = false
          return
        }

        if (!chunks.length) {
          captured = undefined
          return
        }

        const ac = new AbortController()
        abortCtrl = ac
        setStore("recorder", "transcribing", true)

        try {
          const blob = new Blob(chunks, { type: mr.mimeType })
          // Map the actual container to a Whisper-accepted extension.
          // Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, oga, flac.
          // Firefox records ogg/opus by default; Chrome records webm/opus.
          const lowerType = (mr.mimeType || "").toLowerCase()
          const ext = lowerType.includes("webm")
            ? "webm"
            : lowerType.includes("ogg")
              ? "ogg"
              : lowerType.includes("mp4") || lowerType.includes("m4a") || lowerType.includes("aac")
                ? "mp4"
                : lowerType.includes("wav")
                  ? "wav"
                  : "webm" // safe default — most browsers default to webm/opus
          const form = new FormData()
          form.append("file", blob, `recording.${ext}`)
          form.append("model", settings.voice.model())

          const res = await fetch(`${sdk.url}/experimental/transcribe`, {
            method: "POST",
            headers: auth(),
            body: form,
            signal: ac.signal,
          })

          if (!res.ok) {
            const raw = await res.text().catch(() => "")
            let msg = raw || `Request failed with status ${res.status}`
            try {
              const data = JSON.parse(raw) as { error?: string }
              if (typeof data.error === "string" && data.error) msg = data.error
            } catch {}
            throw new Error(msg)
          }

          const data = (await res.json()) as { text?: string }
          const text = data.text?.trim()
          if (text) {
            // Use captured prompt if sending to a background session
            const background = captured && captured.id !== params.id
            const existing = background ? (captured?.prompt ?? "") : readPrompt()
            const combined = existing ? `${existing}\n${text}` : text
            send(combined)
          }
        } catch (err) {
          if (ac.signal.aborted) return
          showToast({
            variant: "error",
            title: language.t("common.requestFailed"),
            description: formatServerError(err, language.t, language.t("common.requestFailed")),
          })
        } finally {
          if (abortCtrl === ac) abortCtrl = undefined
          if (!ac.signal.aborted) setStore("recorder", "transcribing", false)
          captured = undefined
        }
      }

      mediaRecorder = mr
      mr.start()
      setStore("recorder", "recording", true)
      beepStart()

      // Pause stream mode while recording
      streamPause()
    } catch (err) {
      mediaRecorder = undefined
      setStore("recorder", { recording: false, transcribing: false })
      captured = undefined
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: formatServerError(err, language.t, language.t("common.requestFailed")),
      })
    }
  }

  // Resume stream when recorder finishes
  createEffect(() => {
    if (getVoiceStatus(store.recorder) === "idle") streamResume()
  })

  // ─── TTS: text-to-speech via OpenAI API ──────────────────────
  // iOS Safari blocks audio.play() outside user gesture context.
  // We pre-create and "warm up" an Audio element during streamActivate
  // (user tap), then reuse it for TTS by swapping src.

  let ttsEl: HTMLAudioElement | undefined
  let ttsAbort: AbortController | undefined
  let ttsUrl: string | undefined

  /** Call during a user gesture to unlock Audio on iOS Safari */
  const unlockAudio = () => {
    if (ttsEl) return
    const el = new Audio()
    // Play a tiny silent WAV to unlock the element
    el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
    el.volume = 0.01
    el.play()
      .then(() => {
        el.pause()
        el.volume = 1
        el.currentTime = 0
        console.log("[TTS] Audio element unlocked")
      })
      .catch(() => {
        console.warn("[TTS] Audio unlock failed (will retry on next tap)")
      })
    ttsEl = el
  }

  const stopTts = () => {
    ttsAbort?.abort()
    ttsAbort = undefined
    if (ttsEl) {
      ttsEl.pause()
      ttsEl.currentTime = 0
    }
    if (ttsUrl) {
      URL.revokeObjectURL(ttsUrl)
      ttsUrl = undefined
    }
    setStore("tts", "speaking", false)
  }

  const speak = async (id: string) => {
    if (!ttsEl) {
      console.warn("[TTS] Audio element not available")
      return
    }

    const messages = sync.data.message[id] ?? []
    const last = messages.findLast((m) => m.role === "assistant")
    if (!last) {
      console.warn("[TTS] no assistant message found for session", id)
      return
    }

    const parts = sync.data.part[last.id] ?? []
    const text = parts
      .filter((p): p is TextPart => p.type === "text" && !p.synthetic && !p.ignored)
      .map((p) => p.text)
      .join("\n")
      .trim()

    if (!text) {
      console.warn("[TTS] no text parts in assistant message", last.id)
      return
    }

    console.log("[TTS] speaking", text.length, "chars via OpenAI")
    stopTts()

    const ac = new AbortController()
    ttsAbort = ac
    setStore("tts", "speaking", true)

    try {
      const res = await fetch(`${sdk.url}/experimental/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({
          text: text.slice(0, 4096),
          voice: settings.voice.realtimeVoice(),
        }),
        signal: ac.signal,
      })

      if (!res.ok) {
        const raw = await res.text().catch(() => "")
        throw new Error(raw || `TTS failed: ${res.status}`)
      }

      const blob = await res.blob()
      if (ac.signal.aborted) return

      // Revoke previous URL if any
      if (ttsUrl) URL.revokeObjectURL(ttsUrl)
      const url = URL.createObjectURL(blob)
      ttsUrl = url

      const el = ttsEl
      el.src = url

      el.onended = () => {
        console.log("[TTS] playback ended")
        if (!ac.signal.aborted) setStore("tts", "speaking", false)
      }
      el.onerror = () => {
        console.error("[TTS] playback error")
        if (!ac.signal.aborted) setStore("tts", "speaking", false)
      }

      el.volume = 1.0
      console.log("[TTS] starting playback via pre-warmed Audio element, volume:", el.volume)
      await el.play()
      console.log("[TTS] playback started")
    } catch (err) {
      if (ac.signal.aborted) return
      console.error("[TTS] error:", err)
      setStore("tts", "speaking", false)
      showToast({
        variant: "error",
        title: "TTS failed",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (ttsAbort === ac) ttsAbort = undefined
    }
  }

  // [TEMPORARILY DISABLED] Auto-speak on session busy → idle.
  // Re-enable by uncommenting the createEffect block below.
  // createEffect(
  //   on(
  //     () => {
  //       const id = ttsTarget()
  //       if (!id) return undefined
  //       const type = sync.data.session_status[id]?.type
  //       console.log("[TTS] watching session", id, "status:", type)
  //       return type
  //     },
  //     (type, prev) => {
  //       console.log("[TTS] status transition:", prev, "→", type)
  //       if (prev === "busy" && type === "idle") {
  //         const id = untrack(ttsTarget)
  //         setTtsTarget(undefined)
  //         if (id) void speak(id)
  //       }
  //     },
  //     { defer: true },
  //   ),
  // )
  void speak // keep reference so unused-var lint doesn't fire

  // Stop TTS when stream mode deactivates
  createEffect(() => {
    if (!store.stream.active) {
      setTtsTarget(undefined)
      stopTts()
    }
  })

  // ─── Session isolation: auto-stop everything on tab switch ───
  createEffect(
    on(
      () => params.id,
      (next, prev) => {
        if (prev === undefined || next === prev) return

        // Auto-stop MediaRecorder recording
        if (store.recorder.recording && mediaRecorder) {
          console.log(
            "[Voice] tab switch while recording — stopping recorder, transcription will continue in background for session:",
            captured?.id,
          )
          mediaRecorder.stop()
          beepStop()
          // captured session stays — transcription will send to the RIGHT session
        }
      },
      { defer: true },
    ),
  )

  // Cleanup recorder on unmount
  onCleanup(() => {
    if (mediaRecorder) {
      try {
        mediaRecorder.stop()
      } catch {}
      mediaRecorder = undefined
    }
    abortCtrl?.abort()
    abortCtrl = undefined
    if (cooldownTimer) {
      clearTimeout(cooldownTimer)
      cooldownTimer = undefined
    }
    stopTts()
  })

  // ─── Public API ─────────────────────────────────────────────

  console.log("[VoiceProvider] init complete")

  return {
    stream: {
      active: createMemo(() => store.stream.active),
      recording: createMemo(() => store.stream.active),
      paused: createMemo(() => store.stream.paused),
      activate: streamActivate,
      deactivate: streamDeactivate,
      toggle: streamToggle,
      pause: streamPause,
      resume: streamResume,
    },
    recorder: {
      status: createMemo((): VoiceStatus => getVoiceStatus(store.recorder)),
      recording: createMemo(() => store.recorder.recording),
      transcribing: createMemo(() => store.recorder.transcribing),
      cooldown: createMemo(() => store.recorder.cooldown),
      toggle: recorderToggle,
      cancel: recorderCancel,
      queueNavigation,
      cancelPendingNavigation,
    },
    tts: {
      speaking: createMemo(() => store.tts.speaking),
      stop: stopTts,
    },
  }
}
