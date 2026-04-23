/**
 * Custom UI layer — central feature flags.
 *
 * Toggle anything here. Everything in `custom/` reads from this file.
 * Never import from upstream files into `custom/` more than necessary.
 */
export const features = {
  /** Render session tabs strip in the titlebar center slot. */
  sessionTabs: true,

  /** Hide the wide central "search files" pill that appears in the titlebar on session pages. */
  hideCentralSearch: true,

  /** Hide the animated 2px progress bar that appears under the session title while the model is working. */
  hideSessionProgressBar: true,

  /** Hide the "Open in editor / Copy path" pill on the right side of the session header. */
  hideOpenOrCopyPath: true,

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
