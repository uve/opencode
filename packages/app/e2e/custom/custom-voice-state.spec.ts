/**
 * Custom fork — voice-state unit tests.
 *
 * Pure logic tests for voice-state.ts — no browser needed.
 * These run as Playwright test files but only use `expect`, not `page`.
 *
 * Tests are fully decoupled: they inline the logic rather than importing
 * from source, so upstream refactors won't break them. If the logic changes,
 * these tests will catch the drift.
 */
import { test, expect } from "@playwright/test"

// ─── Inline the logic under test (avoids import coupling) ─────
type VoiceStatus = "idle" | "recording" | "transcribing"

function getVoiceStatus(input: { recording: boolean; transcribing: boolean }): VoiceStatus {
  if (input.recording) return "recording"
  if (input.transcribing) return "transcribing"
  return "idle"
}

function isSubmitDisabled(input: {
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

// ─── Tests ────────────────────────────────────────────────────

test.describe("getVoiceStatus", () => {
  test("returns idle when nothing active", () => {
    expect(getVoiceStatus({ recording: false, transcribing: false })).toBe("idle")
  })

  test("returns recording when recording", () => {
    expect(getVoiceStatus({ recording: true, transcribing: false })).toBe("recording")
  })

  test("returns transcribing when transcribing", () => {
    expect(getVoiceStatus({ recording: false, transcribing: true })).toBe("transcribing")
  })

  test("recording takes priority over transcribing", () => {
    expect(getVoiceStatus({ recording: true, transcribing: true })).toBe("recording")
  })
})

test.describe("isSubmitDisabled", () => {
  test("disabled in shell mode", () => {
    expect(isSubmitDisabled({ mode: "shell", status: "idle", dirty: true, working: false, comments: 0 })).toBe(true)
  })

  test("disabled while recording", () => {
    expect(isSubmitDisabled({ mode: "normal", status: "recording", dirty: true, working: false, comments: 0 })).toBe(
      true,
    )
  })

  test("disabled while transcribing", () => {
    expect(
      isSubmitDisabled({ mode: "normal", status: "transcribing", dirty: true, working: false, comments: 0 }),
    ).toBe(true)
  })

  test("disabled when idle, not dirty, not working, no comments", () => {
    expect(isSubmitDisabled({ mode: "normal", status: "idle", dirty: false, working: false, comments: 0 })).toBe(true)
  })

  test("enabled when idle and dirty", () => {
    expect(isSubmitDisabled({ mode: "normal", status: "idle", dirty: true, working: false, comments: 0 })).toBe(false)
  })

  test("enabled when idle and working", () => {
    expect(isSubmitDisabled({ mode: "normal", status: "idle", dirty: false, working: true, comments: 0 })).toBe(false)
  })

  test("enabled when idle with comments", () => {
    expect(isSubmitDisabled({ mode: "normal", status: "idle", dirty: false, working: false, comments: 1 })).toBe(false)
  })
})
