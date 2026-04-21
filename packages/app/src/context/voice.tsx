/**
 * Shim: re-export the custom VoiceProvider so upstream files can keep using
 * `@/context/voice` without knowing about the custom layer.
 *
 * If voice is ever turned off via features.ts, swap this for a no-op provider.
 */
export { VoiceProvider, useVoice } from "@/custom/right-rail/voice-context"
