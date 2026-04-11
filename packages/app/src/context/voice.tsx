import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { createEffect, createMemo, on, onCleanup, onMount, untrack } from "solid-js"
import { useParams } from "@solidjs/router"
import { useLanguage } from "./language"
import { useSettings } from "./settings"
import { useServer } from "./server"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useGlobalSync } from "./global-sync"
import { useLocal } from "./local"
import { useLayout } from "./layout"
import { usePrompt } from "./prompt"
import { formatServerError } from "@/utils/server-errors"
import { beepStart, beepStop } from "@/utils/record-beep"
import { getVoiceStatus, type VoiceStatus } from "@/components/prompt-input/voice-state"
import { sendFollowupDraft } from "@/components/prompt-input/submit"
import { Identifier } from "@/utils/id"

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

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
    stream: { active: false, recording: false, paused: false },
    recorder: { recording: false, transcribing: false, cooldown: false },
  })

  // ─── Instance refs (closure-scoped, NOT module-level) ───────
  let sr: any
  let captured: CapturedSession | undefined
  let streamSeed = ""
  let streamFull = ""
  let mediaRecorder: MediaRecorder | undefined
  let chunks: Blob[] = []
  let abortCtrl: AbortController | undefined
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined

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

  const word = (t: string) =>
    t
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:]+$/, "")
      .trim()

  const lastWord = (t: string) => {
    const words = word(t).split(/\s+/)
    return words[words.length - 1] || ""
  }

  const bodyText = (t: string) => {
    const words = word(t).split(/\s+/)
    words.pop()
    return words.join(" ")
  }

  const isCmd = (w: string, cmds: string[]) => cmds.some((c) => w === c)

  const streamText = () => {
    if (!streamSeed && !streamFull) return ""
    if (!streamSeed) return streamFull
    if (!streamFull) return streamSeed
    return `${streamSeed}\n${streamFull}`
  }

  const push = (raw: string) => {
    const next = raw.replace(/\s+/g, " ").trim()
    if (!next) return
    if (!streamFull && !streamSeed) streamSeed = readPrompt()
    streamFull = streamFull ? `${streamFull} ${next}` : next
    writePrompt(streamText())
  }

  const streamSubmit = () => {
    const result = streamText().trim()
    streamSeed = ""
    streamFull = ""
    setStore("stream", "recording", false)
    beepStop()
    if (result) send(result)
    captured = undefined
  }

  const onFinal = (raw: string) => {
    console.log("[StreamMode] onFinal:", raw, "recording:", store.stream.recording)
    const w = word(raw)
    const tail = lastWord(raw)
    const solo = !w.includes(" ")

    // Not recording — wait for "старт"/"start"
    if (!store.stream.recording) {
      if (isCmd(solo ? w : tail, ["старт", "start"])) {
        captureSession()
        streamSeed = readPrompt()
        streamFull = ""
        setStore("stream", "recording", true)
        beepStart()
        if (!solo) {
          const rest = bodyText(raw)
          if (rest) push(rest)
        }
      }
      return
    }

    // "отправить"/"send" — send and stop
    if (isCmd(solo ? w : tail, ["отправить", "send"])) {
      if (!solo) {
        const rest = bodyText(raw)
        if (rest) push(rest)
      }
      streamSubmit()
      return
    }

    // "стоп"/"stop" — stop without sending
    if (isCmd(solo ? w : tail, ["стоп", "stop"])) {
      if (!solo) {
        const rest = bodyText(raw)
        if (rest) push(rest)
      }
      streamSubmit()
      return
    }

    push(raw)
  }

  const streamActivate = () => {
    if (sr) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      showToast({
        variant: "error",
        title: "Speech API unavailable",
        description: "Your browser does not support Web Speech API",
      })
      return
    }

    const instance = new SR()
    instance.continuous = true
    instance.interimResults = false
    instance.lang = "ru-RU"

    let errors = 0
    instance.onstart = () => {
      errors = 0
    }
    instance.onerror = (e: Event & { error?: string }) => {
      // "aborted" = Safari auto-stops after silence, "no-speech" = timeout — both normal
      if (e.error === "aborted" || e.error === "no-speech") return
      errors++
      console.warn("[StreamMode] error:", e.error, `(${errors})`)
    }
    instance.onend = () => {
      if (!store.stream.active || store.stream.paused) return
      // Give up after 3 consecutive errors — browser doesn't support it
      if (errors >= 3) {
        console.warn("[StreamMode] too many errors, deactivating")
        sr = undefined
        setStore("stream", "active", false)
        return
      }
      try {
        instance.start()
      } catch {}
    }
    instance.onresult = (e: SpeechRecognitionEvent) => {
      console.log("[StreamMode] onresult, results:", e.results.length, "resultIndex:", e.resultIndex)
      for (let i = e.resultIndex; i < e.results.length; i++) {
        console.log(
          "[StreamMode] result[",
          i,
          "] isFinal:",
          e.results[i].isFinal,
          "transcript:",
          e.results[i][0].transcript,
        )
        if (!e.results[i].isFinal) continue
        onFinal(e.results[i][0].transcript)
      }
    }

    sr = instance
    setStore("stream", { active: true, recording: false, paused: false })
    try {
      instance.start()
      console.log("[StreamMode] started successfully")
    } catch (err) {
      console.error("[StreamMode] start failed:", err)
      sr = undefined
      setStore("stream", "active", false)
      showToast({
        variant: "error",
        title: "Voice mode failed",
        description: String(err instanceof Error ? err.message : err),
      })
    }
  }

  const streamDeactivate = () => {
    setStore("stream", { active: false, recording: false, paused: false })
    if (sr) {
      try {
        sr.stop()
      } catch {}
      sr = undefined
    }
    streamSeed = ""
    streamFull = ""
  }

  const streamToggle = () => {
    if (store.stream.active) streamDeactivate()
    else streamActivate()
  }

  const streamPause = () => {
    if (!sr || store.stream.paused) return
    setStore("stream", "paused", true)
    try {
      sr.stop()
    } catch {}
  }

  const streamResume = () => {
    if (!sr || !store.stream.paused) return
    setStore("stream", "paused", false)
    if (!store.stream.active) return
    try {
      sr.start()
    } catch {}
  }

  // Stream mode is opt-in: user clicks the headphones button to activate.
  // No auto-activation — avoids infinite error loops on browsers
  // where Web Speech API is blocked (Edge CSP, network errors).
  onCleanup(streamDeactivate)

  // ─── Global shortcuts: Enter → record, Mouse4 → record ─────

  const recorderActive = () => getVoiceStatus(store.recorder) !== "idle"

  const onKey = (e: KeyboardEvent) => {
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

    // ── Capture session BEFORE recording starts ──
    captureSession()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mr.onstop = async () => {
        mediaRecorder = undefined
        stream.getTracks().forEach((t) => t.stop())
        setStore("recorder", "recording", false)

        if (!chunks.length) {
          captured = undefined
          return
        }

        const ac = new AbortController()
        abortCtrl = ac
        setStore("recorder", "transcribing", true)

        try {
          const blob = new Blob(chunks, { type: mr.mimeType })
          const ext = mr.mimeType.includes("webm") ? "webm" : "mp4"
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

        // Auto-submit stream text to the PREVIOUS session
        if (store.stream.recording) {
          untrack(streamSubmit)
        }

        // Reset stream seed/full for the new session
        streamSeed = ""
        streamFull = ""
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
  })

  // ─── Public API ─────────────────────────────────────────────

  console.log("[VoiceProvider] init complete")

  return {
    stream: {
      active: createMemo(() => store.stream.active),
      recording: createMemo(() => store.stream.recording),
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
    },
  }
}
