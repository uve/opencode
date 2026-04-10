export type VoiceStatus = "idle" | "recording" | "transcribing"

export function getVoiceStatus(input: { recording: boolean; transcribing: boolean }): VoiceStatus {
  if (input.recording) return "recording"
  if (input.transcribing) return "transcribing"
  return "idle"
}

export function isSubmitDisabled(input: {
  mode: "normal" | "shell"
  status: VoiceStatus
  dirty: boolean
  working: boolean
  comments: number
}) {
  if (input.mode !== "normal") return true
  if (input.status !== "idle") return true
  return !input.dirty && !input.working && input.comments === 0
}
