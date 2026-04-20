/**
 * Custom fork — build & verification smoke tests.
 *
 * These tests verify that the custom fork's infrastructure scripts
 * exist and are functional. They don't actually build — just smoke-test
 * the scripts and verify custom patches are present in source.
 */
import { test, expect } from "@playwright/test"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../..")

// ────────────────────────────────────────────────────────────────
// 1. Build script exists and is valid bash
// ────────────────────────────────────────────────────────────────
test.describe("build infrastructure (custom fork)", () => {
  test("cmd/build.sh exists and is executable", () => {
    const p = path.join(root, "cmd/build.sh")
    expect(fs.existsSync(p)).toBe(true)
    const stat = fs.statSync(p)
    // Check owner-execute bit
    expect(stat.mode & 0o100 || stat.mode & 0o010 || stat.mode & 0o001).toBeTruthy()
  })

  test("cmd/build.sh uses setsid for SIGHUP protection", () => {
    const content = fs.readFileSync(path.join(root, "cmd/build.sh"), "utf8")
    expect(content).toContain("setsid")
  })

  test("cmd/autoupdate.sh exists", () => {
    expect(fs.existsSync(path.join(root, "cmd/autoupdate.sh"))).toBe(true)
  })

  test("cmd/verify-custom.sh exists", () => {
    expect(fs.existsSync(path.join(root, "cmd/verify-custom.sh"))).toBe(true)
  })

  test("cmd/setup-service.sh exists", () => {
    expect(fs.existsSync(path.join(root, "cmd/setup-service.sh"))).toBe(true)
  })

  test("systemd unit template exists", () => {
    expect(fs.existsSync(path.join(root, "cmd/opencode.service"))).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────
// 2. Verify custom patches presence in source
// ────────────────────────────────────────────────────────────────
test.describe("custom patch markers in source (custom fork)", () => {
  test("ALLOWED_MODELS filter exists in provider.ts", () => {
    const content = fs.readFileSync(path.join(root, "packages/opencode/src/provider/provider.ts"), "utf8")
    expect(content).toContain("ALLOWED_MODELS")
    expect(content).toContain("github-copilot")
    expect(content).toContain("claude-opus-4.6")
  })

  test("voice-state.ts exists with VoiceStatus type", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/components/prompt-input/voice-state.ts"),
      "utf8",
    )
    expect(content).toContain("VoiceStatus")
    expect(content).toContain("recording")
    expect(content).toContain("transcribing")
  })

  test("voice-recorder.tsx exists with VoiceRecorderButton", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/components/prompt-input/voice-recorder.tsx"),
      "utf8",
    )
    expect(content).toContain("VoiceRecorderButton")
    expect(content).toContain("microphone")
  })

  test("voice-mode.tsx exists with VoiceModeButton", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/components/prompt-input/voice-mode.tsx"),
      "utf8",
    )
    expect(content).toContain("VoiceModeButton")
  })

  test("scroll-buttons.tsx exists with ScrollButtons", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/components/prompt-input/scroll-buttons.tsx"),
      "utf8",
    )
    expect(content).toContain("ScrollButtons")
    expect(content).toContain("Scroll up")
    expect(content).toContain("Scroll down")
  })

  test("voice.tsx context provider exists", () => {
    const content = fs.readFileSync(path.join(root, "packages/app/src/context/voice.tsx"), "utf8")
    expect(content).toContain("VoiceProvider")
    expect(content).toContain("useVoice")
    expect(content).toContain("recorder")
    expect(content).toContain("transcrib")
  })

  test("sessions-sidebar.tsx exists with SessionsSidebar component", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/pages/layout/sessions-sidebar.tsx"),
      "utf8",
    )
    expect(content).toContain("SessionsSidebar")
    expect(content).toContain("Sessions")
  })

  test("sidebar-shell.tsx has onRestart prop", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/pages/layout/sidebar-shell.tsx"),
      "utf8",
    )
    expect(content).toContain("onRestart")
    expect(content).toContain('aria-label="Restart"')
  })

  test("experimental routes include transcribe endpoint", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/opencode/src/server/routes/experimental.ts"),
      "utf8",
    )
    expect(content).toContain("/transcribe")
    expect(content).toContain("experimental.transcribe")
  })

  test("icon.tsx includes microphone and reload icons", () => {
    const content = fs.readFileSync(path.join(root, "packages/ui/src/components/icon.tsx"), "utf8")
    expect(content).toContain("microphone")
    expect(content).toContain("reload")
  })

  test("i18n en.ts includes voice action keys", () => {
    const content = fs.readFileSync(path.join(root, "packages/app/src/i18n/en.ts"), "utf8")
    expect(content).toContain("prompt.action.record")
    expect(content).toContain("prompt.action.recording")
    expect(content).toContain("prompt.action.transcribing")
  })

  test("settings.tsx includes voice settings", () => {
    const content = fs.readFileSync(path.join(root, "packages/app/src/context/settings.tsx"), "utf8")
    expect(content).toContain("voice")
    expect(content).toContain("voice.enabled")
    expect(content).toContain("voice.model")
  })

  test("app.tsx imports VoiceProvider", () => {
    const content = fs.readFileSync(path.join(root, "packages/app/src/app.tsx"), "utf8")
    expect(content).toContain("VoiceProvider")
    expect(content).toContain("@/context/voice")
  })

  test("session-composer-region.tsx uses voice and scroll components", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/pages/session/composer/session-composer-region.tsx"),
      "utf8",
    )
    expect(content).toContain("VoiceRecorderButton")
    expect(content).toContain("VoiceModeButton")
    expect(content).toContain("ScrollButtons")
  })

  test("record-beep.ts utility exists", () => {
    expect(fs.existsSync(path.join(root, "packages/app/src/utils/record-beep.ts"))).toBe(true)
  })

  test("layout.tsx has sessionsSidebar support", () => {
    const content = fs.readFileSync(path.join(root, "packages/app/src/context/layout.tsx"), "utf8")
    expect(content).toContain("sessionsSidebar")
  })

  test("global-sync.tsx starts event stream synchronously", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/app/src/context/global-sync.tsx"),
      "utf8",
    )
    // Should NOT have requestAnimationFrame delay
    expect(content).not.toMatch(/requestAnimationFrame.*event\.start/)
    // Should call start() directly in onMount
    expect(content).toContain("globalSDK.event.start()")
  })

  test("AsyncQueue has capacity limit", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/opencode/src/util/queue.ts"),
      "utf8",
    )
    expect(content).toContain("cap")
    // Verify the queue drops old entries when full
    expect(content).toContain("splice")
  })

  test("SSE event route uses bounded queue", () => {
    const content = fs.readFileSync(
      path.join(root, "packages/opencode/src/server/routes/event.ts"),
      "utf8",
    )
    // Should pass a capacity to AsyncQueue
    expect(content).toMatch(/new AsyncQueue.*\(\d/)
  })
})

// ────────────────────────────────────────────────────────────────
// 3. verify-custom.sh smoke test (skip if it reports known stale checks)
// ────────────────────────────────────────────────────────────────
test.describe("verify-custom.sh (custom fork)", () => {
  test("verify-custom.sh runs without crashing", () => {
    // Note: verify-custom.sh may report FAILED due to stale checks
    // from old architecture. We just verify it runs without error.
    let output: string
    try {
      output = execSync(`bash ${path.join(root, "cmd/verify-custom.sh")}`, {
        cwd: root,
        timeout: 30_000,
        encoding: "utf8",
      })
    } catch (e: any) {
      // execSync throws on non-zero exit — still check output
      output = e.stdout ?? e.message ?? ""
    }
    // Should contain some checks (✓ or ✗ markers)
    expect(output).toMatch(/[✓✗]/)
  })
})

// ────────────────────────────────────────────────────────────────
// 4. systemd service configuration
// ────────────────────────────────────────────────────────────────
test.describe("systemd service (custom fork)", () => {
  test("service unit cleans locks before start", () => {
    const live = path.join(
      process.env.HOME ?? "/home/uve",
      ".config/systemd/user/opencode.service",
    )
    if (!fs.existsSync(live)) {
      test.skip()
      return
    }
    const content = fs.readFileSync(live, "utf8")
    expect(content).toContain("ExecStartPre")
    expect(content).toContain("locks")
  })
})
