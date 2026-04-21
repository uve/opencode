/**
 * Right-rail UI: scroll up/down + voice mode + voice recorder.
 *
 * Positioned via fixed at viewport edge — no anchor needed in upstream.
 */
import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { features } from "../features"
import { ScrollButtons } from "./scroll-buttons"
import { VoiceModeButton } from "./voice-mode"
import { VoiceRecorderButton } from "./voice-recorder"

export function RightRail() {
  return (
    <Portal>
      <div class="fixed right-3 top-1/2 -translate-y-1/2 z-50 pointer-events-auto flex flex-col items-end gap-3">
        <Show when={features.scrollButtons}>
          <div class="flex flex-col items-end gap-3 mb-4">
            <ScrollButtons />
          </div>
        </Show>
        <Show when={features.voiceMode}>
          <VoiceModeButton />
        </Show>
        <Show when={features.voiceRecorder}>
          <VoiceRecorderButton />
        </Show>
      </div>
    </Portal>
  )
}
