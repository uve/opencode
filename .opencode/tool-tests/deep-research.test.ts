import { describe, expect, test } from "bun:test"

/**
 * Integration tests for the deep-research tool.
 * Verifies real API connectivity with Google Gemini Deep Research Agent.
 *
 * Run from .opencode/:
 *   source ../.env && bun test tool-tests/deep-research.test.ts
 *
 * Requires GEMINI_API_KEY in environment.
 */

const key = process.env.GEMINI_API_KEY ?? ""
const BASE = "https://generativelanguage.googleapis.com/v1beta"
const AGENT = "deep-research-pro-preview-12-2025"

describe.skipIf(!key)("deep-research integration", () => {
  test("interactions API: create deep research task + poll", async () => {
    const res = await fetch(`${BASE}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        agent: AGENT,
        input:
          "Conduct a comprehensive, multi-step deep research investigation. " +
          "Search and read AT LEAST 10 different web sources. " +
          "Research topic: What are the latest features in Bun.js runtime as of 2026? " +
          "Produce a detailed report with sources.",
        background: true,
        store: true,
        agent_config: {
          type: "deep-research",
          thinking_summaries: "auto",
        },
      }),
    })

    expect(res.ok).toBe(true)
    const created = await res.json()
    expect(created.id).toBeTruthy()
    console.log("Created interaction:", created.id, "status:", created.status)

    // Poll a few times to confirm the task is running
    let ok = false
    let delay = 5000
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, delay))
      const poll = await fetch(`${BASE}/interactions/${created.id}`, {
        headers: { "x-goog-api-key": key },
      })
      console.log(`Poll attempt ${i + 1}: HTTP ${poll.status}`)

      if (poll.ok) {
        const state = await poll.json()
        console.log("Status:", state.status)
        expect(["in_progress", "completed"]).toContain(state.status)

        if (state.status === "completed" && state.outputs?.length) {
          const output = state.outputs[state.outputs.length - 1].text ?? ""
          console.log("Output preview:", output.slice(0, 300))
          expect(output.length).toBeGreaterThan(100)
        }
        ok = true
        break
      }

      if (poll.status >= 500) {
        console.log(`Server error, retrying in ${delay}ms...`)
        delay = Math.min(delay * 1.5, 15000)
        continue
      }

      const err = await poll.text()
      throw new Error(`Unexpected polling error ${poll.status}: ${err}`)
    }

    expect(ok).toBe(true)
  }, 120_000)
})
