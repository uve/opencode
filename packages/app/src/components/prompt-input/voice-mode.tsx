import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { useVoice } from "@/context/voice"

/** Thin button — all logic lives in VoiceProvider */
export function VoiceModeButton() {
  const voice = useVoice()

  return (
    <button
      type="button"
      onClick={() => voice.stream.toggle()}
      aria-label={voice.stream.recording() ? "Recording" : voice.stream.active() ? "Listening" : "Off"}
      class="relative flex items-center justify-center gap-2 rounded-full border border-black outline-none select-none cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      classList={{
        "w-14 h-14 md:w-20 md:h-20": true,
        "bg-[color-mix(in_srgb,var(--color-icon-info-base)_15%,transparent)]": !voice.stream.active(),
        "text-icon-info-base hover:opacity-100 hover:scale-105 active:scale-95": !voice.stream.active(),
        "bg-surface-info-weak text-icon-info-base animate-[listening-border_1.2s_ease-in-out_infinite]":
          voice.stream.active() && !voice.stream.recording(),
        "bg-[color-mix(in_srgb,var(--color-icon-critical-base)_18%,transparent)]": voice.stream.recording(),
        "text-icon-critical-base animate-[recording-border_1.2s_ease-in-out_infinite]": voice.stream.recording(),
      }}
    >
      <Show when={!voice.stream.active()}>
        <Icon name="headphones" size="large" class="md:!size-8" />
      </Show>
      <Show when={voice.stream.active() && !voice.stream.recording()}>
        <Icon name="headphones" size="large" class="md:!size-8" />
      </Show>
      <Show when={voice.stream.recording()}>
        <Icon name="microphone" size="large" class="md:!size-8" />
      </Show>
    </button>
  )
}
