/**
 * Custom UI layer — central feature flags.
 *
 * Toggle anything here. Everything in `custom/` reads from this file.
 * Never import from upstream files into `custom/` more than necessary.
 */
export const features = {
  /** Right-rail scroll up/down buttons (fixed on viewport right edge). */
  scrollButtons: true,

  /** Voice mode (hands-free conversation) button on the right rail. */
  voiceMode: true,

  /** Voice recorder (push-to-talk transcription) button on the right rail. */
  voiceRecorder: true,

  /** Cross-device client UI state sync (open projects + session tabs) via backend SQLite. */
  clientStateSync: true,
}

export type Feature = keyof typeof features
