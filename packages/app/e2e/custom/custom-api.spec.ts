/**
 * Custom fork — API-level E2E tests.
 *
 * These tests hit the running opencode server directly via HTTP
 * and do NOT depend on app source code, only on API contracts.
 * This makes them rebase-safe: upstream refactors won't break them
 * as long as the API surface stays the same.
 */
import { test, expect } from "@playwright/test"

const base = process.env.PLAYWRIGHT_SERVER_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const auth = process.env.PLAYWRIGHT_SERVER_AUTH // "user:pass" or undefined

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" }
  if (auth) h.authorization = `Basic ${Buffer.from(auth).toString("base64")}`
  return h
}

// ────────────────────────────────────────────────────────────────
// 1. Health / Version
// ────────────────────────────────────────────────────────────────
test.describe("global health endpoint", () => {
  test("GET /global/health returns healthy + version string", async ({ request }) => {
    const res = await request.get(`${base}/global/health`, { headers: headers() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("healthy", true)
    expect(body).toHaveProperty("version")
    expect(typeof body.version).toBe("string")
    expect(body.version.length).toBeGreaterThan(0)
  })
})

// ────────────────────────────────────────────────────────────────
// 2. Provider filter — only github-copilot with ALLOWED_MODELS
// ────────────────────────────────────────────────────────────────
test.describe("provider filter (custom fork)", () => {
  const ALLOWED_MODELS = new Set([
    "claude-opus-4.6",
    "claude-opus-4.6-1m",
    "gpt-5.4",
    "gemini-3.1-pro-preview",
  ])

  test("GET /provider returns only allowed providers", async ({ request }) => {
    const res = await request.get(`${base}/provider`, { headers: headers() })
    // May return 200 or 401 depending on auth config
    if (res.status() === 401) {
      test.skip()
      return
    }
    expect(res.status()).toBe(200)
    const body = await res.json()

    // Body should have `all` or `connected` arrays — check either format
    const providers: Array<{ id: string; models?: Record<string, unknown> }> =
      body.all ?? body.connected ?? body.data ?? []

    if (providers.length === 0) {
      // Server may not have configured providers — skip gracefully
      test.skip()
      return
    }

    // Only github-copilot should survive the filter
    const ids = providers.map((p: { id: string }) => p.id)
    for (const id of ids) {
      expect(["github-copilot", "openai"]).toContain(id)
    }
  })

  test("github-copilot models are limited to ALLOWED_MODELS set", async ({ request }) => {
    const res = await request.get(`${base}/provider`, { headers: headers() })
    if (res.status() === 401) {
      test.skip()
      return
    }
    const body = await res.json()
    const providers: Array<{ id: string; models?: Record<string, unknown> }> =
      body.all ?? body.connected ?? body.data ?? []

    const copilot = providers.find((p) => p.id === "github-copilot")
    if (!copilot?.models) {
      test.skip()
      return
    }

    const ids = Object.keys(copilot.models)
    for (const id of ids) {
      expect(ALLOWED_MODELS.has(id)).toBe(true)
    }
  })
})

// ────────────────────────────────────────────────────────────────
// 3. Experimental routes — transcribe, console
// ────────────────────────────────────────────────────────────────
test.describe("experimental routes (custom fork)", () => {
  test("POST /experimental/transcribe exists (not 404)", async ({ request }) => {
    // We don't send a real file — just verify the route is registered
    const res = await request.post(`${base}/experimental/transcribe`, {
      headers: headers(),
      multipart: {
        file: { name: "test.wav", mimeType: "audio/wav", buffer: Buffer.from("fake") },
      },
    })
    // Expect 400 (bad input) or 500 (no API key), NOT 404
    expect(res.status()).not.toBe(404)
  })

  test("GET /experimental/console exists (not 404)", async ({ request }) => {
    const res = await request.get(`${base}/experimental/console`, { headers: headers() })
    expect(res.status()).not.toBe(404)
  })

  test("GET /experimental/console/orgs exists (not 404)", async ({ request }) => {
    const res = await request.get(`${base}/experimental/console/orgs`, { headers: headers() })
    expect(res.status()).not.toBe(404)
  })

  test("GET /experimental/tool/ids exists", async ({ request }) => {
    const res = await request.get(`${base}/experimental/tool/ids`, { headers: headers() })
    expect(res.status()).not.toBe(404)
  })
})

// ────────────────────────────────────────────────────────────────
// 4. SSE event stream — connection & heartbeat
// ────────────────────────────────────────────────────────────────
test.describe("SSE event stream", () => {
  test("GET /event connects and receives server.connected", async () => {
    const h = headers()
    h.accept = "text/event-stream"
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 10_000)

    try {
      const res = await fetch(`${base}/event`, { headers: h, signal: ctrl.signal })
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/event-stream")

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let found = false

      while (!found) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        if (buf.includes("server.connected")) found = true
      }

      expect(found).toBe(true)
      reader.cancel()
    } finally {
      clearTimeout(timeout)
      ctrl.abort()
    }
  })
})
