import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useVoice } from "@/context/voice"

/** Thin button — all logic + double-tap protection live in VoiceProvider */
export function VoiceRecorderButton() {
  const voice = useVoice()
  const language = useLanguage()

  const active = () => voice.recorder.status() !== "idle"
  const recording = () => voice.recorder.recording()
  const transcribing = () => voice.recorder.transcribing()
  const cooldown = () => voice.recorder.cooldown()

  return (
    <button
      type="button"
      onClick={() => {
        console.log("[RecorderButton] click, status:", voice.recorder.status(), "cooldown:", cooldown())
        void voice.recorder.toggle()
      }}
      disabled={cooldown()}
      aria-label={
        recording()
          ? language.t("prompt.action.stop")
          : transcribing()
            ? language.t("prompt.action.transcribing")
            : language.t("prompt.action.record")
      }
      class="relative flex items-center justify-center gap-2 rounded-full border border-black outline-none select-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      classList={{
        "cursor-pointer": !cooldown(),
        "cursor-not-allowed opacity-40": cooldown() && !active(),
        "w-14 h-14 md:w-28 md:h-28": !active(),
        "bg-[color-mix(in_srgb,var(--color-icon-critical-base)_15%,transparent)]": !active(),
        "text-icon-critical-base hover:scale-105 active:scale-95": !active() && !cooldown(),
        "h-14 px-5 md:h-20 md:px-7": active(),
        "bg-[color-mix(in_srgb,var(--color-icon-critical-base)_18%,transparent)]": recording(),
        "text-icon-critical-base animate-[recording-border_1.2s_ease-in-out_infinite]": recording(),
        "bg-surface-info-weak text-icon-info-base shadow-[var(--shadow-xs-border-base)] animate-pulse": transcribing(),
      }}
    >
      <Show when={!active() && !cooldown()}>
        <Icon name="microphone" size="large" class="md:!size-10" />
      </Show>
      <Show when={cooldown() && !active()}>
        <Icon name="microphone" size="large" class="md:!size-10" />
      </Show>
      <Show when={recording()}>
        <span class="relative flex size-4 md:size-6 shrink-0 items-center justify-center">
          <span class="absolute size-4 md:size-6 rounded-full bg-icon-critical-base opacity-45 animate-ping" />
          <span class="relative size-3 md:size-5 rounded-full bg-icon-critical-base shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-icon-critical-base)_18%,transparent)]" />
        </span>
        <span class="font-medium tracking-[0.01em] text-text-on-critical-base whitespace-nowrap md:text-lg">
          {language.t("prompt.action.recording")}
        </span>
      </Show>
      <Show when={transcribing()}>
        <Spinner class="size-4 md:size-6" />
        <span class="font-medium tracking-[0.01em] text-text-on-info-base whitespace-nowrap md:text-lg">
          {language.t("prompt.action.transcribing")}
        </span>
      </Show>
    </button>
  )
}
