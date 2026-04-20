import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { useVoice } from "@/context/voice"

/** Thin button — all logic lives in VoiceProvider */
export function VoiceModeButton() {
  const voice = useVoice()
  const active = () => voice.stream.active()

  return (
    <button
      type="button"
      onClick={() => voice.stream.toggle()}
      aria-label={active() ? "Voice mode" : "Off"}
      class="relative flex items-center justify-center gap-2 rounded-full border border-black outline-none select-none cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      classList={{
        "w-14 h-14 md:w-20 md:h-20": !active(),
        "bg-[color-mix(in_srgb,var(--color-icon-info-base)_15%,transparent)]": !active(),
        "text-icon-info-base hover:opacity-100 hover:scale-105 active:scale-95": !active(),
        "h-14 px-5 md:h-20 md:px-7": active(),
        "bg-[color-mix(in_srgb,var(--color-icon-critical-base)_18%,transparent)]": active(),
        "text-icon-critical-base animate-[recording-border_1.2s_ease-in-out_infinite]": active(),
      }}
    >
      <Show when={!active()}>
        <Icon name="headphones" size="large" class="md:!size-8" />
      </Show>
      <Show when={active()}>
        <span class="relative flex size-4 md:size-6 shrink-0 items-center justify-center">
          <span class="absolute size-4 md:size-6 rounded-full bg-icon-critical-base opacity-45 animate-ping" />
          <span class="relative size-3 md:size-5 rounded-full bg-icon-critical-base shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-icon-critical-base)_18%,transparent)]" />
        </span>
        <span class="font-medium tracking-[0.01em] text-text-on-critical-base whitespace-nowrap md:text-lg">Voice</span>
      </Show>
    </button>
  )
}
