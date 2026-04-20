/**
 * Custom fork — source file inventory test.
 *
 * This test maintains an explicit list of ALL custom files added by our fork.
 * If any file is deleted during a rebase, this test fails immediately.
 *
 * Update this list whenever you add new custom files.
 */
import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../..")

const CUSTOM_FILES = [
  // Voice input
  "packages/app/src/components/prompt-input/voice-state.ts",
  "packages/app/src/components/prompt-input/voice-state.test.ts",
  "packages/app/src/components/prompt-input/voice-recorder.tsx",
  "packages/app/src/components/prompt-input/voice-mode.tsx",
  "packages/app/src/components/prompt-input/scroll-buttons.tsx",
  "packages/app/src/context/voice.tsx",
  "packages/app/src/utils/record-beep.ts",
  "packages/app/src/utils/sound.ts",

  // Sessions sidebar
  "packages/app/src/pages/layout/sessions-sidebar.tsx",
  "packages/opencode/src/cli/cmd/tui/routes/session/sidebar-sessions.tsx",

  // Model variant context
  "packages/app/src/context/model-variant.ts",

  // Project nav
  "packages/app/src/pages/layout/project-nav.ts",
  "packages/app/src/pages/layout/project-nav.test.ts",

  // Session tabs strip
  "packages/app/src/components/session-tabs-strip.tsx",

  // Server scripts
  "cmd/build.sh",
  "cmd/autoupdate.sh",
  "cmd/verify-custom.sh",
  "cmd/setup-service.sh",
  "cmd/opencode.service",

  // E2E test infrastructure
  "packages/app/e2e/custom/custom-api.spec.ts",
  "packages/app/e2e/custom/custom-ui.spec.ts",
  "packages/app/e2e/custom/custom-voice-state.spec.ts",
  "packages/app/e2e/custom/custom-build.spec.ts",
  "packages/app/e2e/custom/custom-inventory.spec.ts",
  "packages/app/e2e/custom/Dockerfile",
  "packages/app/e2e/custom/run.sh",
  "packages/app/playwright-custom.config.ts",
]

/**
 * Strings that MUST exist in specific files.
 * If upstream removes or renames them, this test catches it.
 */
const CUSTOM_MARKERS: Array<{ file: string; markers: string[] }> = [
  {
    file: "packages/opencode/src/provider/provider.ts",
    markers: ["ALLOWED_MODELS", "github-copilot"],
  },
  {
    file: "packages/opencode/src/server/routes/experimental.ts",
    markers: ["/transcribe", "experimental.transcribe"],
  },
  {
    file: "packages/ui/src/components/icon.tsx",
    markers: ["microphone", "reload"],
  },
  {
    file: "packages/app/src/i18n/en.ts",
    markers: ["prompt.action.record", "prompt.action.recording", "prompt.action.transcribing"],
  },
  {
    file: "packages/app/src/context/settings.tsx",
    markers: ["voice.enabled", "voice.model"],
  },
  {
    file: "packages/app/src/app.tsx",
    markers: ["VoiceProvider"],
  },
  {
    file: "packages/app/src/pages/layout/sidebar-shell.tsx",
    markers: ["onRestart", 'aria-label="Restart"'],
  },
  {
    file: "packages/app/src/pages/session/composer/session-composer-region.tsx",
    markers: ["VoiceRecorderButton", "VoiceModeButton", "ScrollButtons"],
  },
  {
    file: "packages/app/src/context/layout.tsx",
    markers: ["sessionsSidebar"],
  },
  {
    file: "packages/app/src/context/global-sync.tsx",
    markers: ["globalSDK.event.start()"],
  },
  {
    file: "packages/opencode/src/util/queue.ts",
    markers: ["cap", "splice"],
  },
  {
    file: "packages/opencode/src/server/routes/event.ts",
    markers: ["AsyncQueue"],
  },
  {
    file: "packages/opencode/src/cli/cmd/tui/routes/session/header.tsx",
    markers: ["SessionHeader"],
  },
]

test.describe("custom file inventory (custom fork)", () => {
  for (const file of CUSTOM_FILES) {
    test(`${file} exists`, () => {
      const full = path.join(root, file)
      expect(fs.existsSync(full), `Missing custom file: ${file}`).toBe(true)
    })
  }
})

test.describe("custom markers in shared files (custom fork)", () => {
  for (const { file, markers } of CUSTOM_MARKERS) {
    test(`${file} contains custom markers`, () => {
      const full = path.join(root, file)
      expect(fs.existsSync(full), `File missing: ${file}`).toBe(true)
      const content = fs.readFileSync(full, "utf8")
      for (const marker of markers) {
        expect(content, `Missing marker "${marker}" in ${file}`).toContain(marker)
      }
    })
  }
})
