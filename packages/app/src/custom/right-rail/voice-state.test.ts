import { describe, expect, test } from "bun:test"
import { getVoiceStatus, isSubmitDisabled } from "./voice-state"

describe("voice state", () => {
  test("prefers recording over transcribing", () => {
    expect(getVoiceStatus({ recording: true, transcribing: true })).toBe("recording")
  })

  test("returns transcribing when audio is processing", () => {
    expect(getVoiceStatus({ recording: false, transcribing: true })).toBe("transcribing")
  })

  test("returns idle when voice is inactive", () => {
    expect(getVoiceStatus({ recording: false, transcribing: false })).toBe("idle")
  })

  test("disables submit while voice capture is active", () => {
    expect(
      isSubmitDisabled({
        mode: "normal",
        status: "recording",
        dirty: true,
        working: false,
        comments: 0,
      }),
    ).toBe(true)
    expect(
      isSubmitDisabled({
        mode: "normal",
        status: "transcribing",
        dirty: true,
        working: false,
        comments: 0,
      }),
    ).toBe(true)
  })

  test("keeps stop available while working when voice is idle", () => {
    expect(
      isSubmitDisabled({
        mode: "normal",
        status: "idle",
        dirty: false,
        working: true,
        comments: 0,
      }),
    ).toBe(false)
  })
})
