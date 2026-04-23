/**
 * Custom fork — client-state-sync API E2E.
 *
 * Hits the running opencode-dev backend on port 4097 directly via HTTP.
 *
 * Verifies:
 *   1. PUT writes and returns time_updated
 *   2. GET reads back the same row
 *   3. Optimistic concurrency: stale if_match → 409
 *   4. Bus event broadcast: PUT triggers `custom.client_state.updated` SSE
 *
 * Rebase-safe: depends only on the `/custom/client-state` API contract +
 * `/global/event` SSE shape, not on app source code.
 */
import { test, expect, type APIRequestContext } from "@playwright/test"
import { randomUUID } from "node:crypto"

const base = process.env.PLAYWRIGHT_SERVER_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4097"}`
const auth = process.env.PLAYWRIGHT_SERVER_AUTH

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" }
  if (auth) h.authorization = `Basic ${Buffer.from(auth).toString("base64")}`
  return h
}

async function put(request: APIRequestContext, body: { state: string; device_id: string; if_match?: number }) {
  return request.put(`${base}/custom/client-state?directory=${encodeURIComponent(process.cwd())}`, {
    headers: headers(),
    data: body,
  })
}

async function get(request: APIRequestContext) {
  return request.get(`${base}/custom/client-state?directory=${encodeURIComponent(process.cwd())}`, {
    headers: headers(),
  })
}

test.describe.configure({ mode: "serial" })

test.describe("custom client-state sync API", () => {
  test("PUT then GET round-trips the blob", async ({ request }) => {
    const blob = JSON.stringify({ test: randomUUID() })
    const dev = `dev_${randomUUID().slice(0, 8)}`

    const putRes = await put(request, { state: blob, device_id: dev })
    if (putRes.status() === 401) test.skip(true, "auth required")
    expect(putRes.status()).toBe(200)
    const written = await putRes.json()
    expect(written.state).toBe(blob)
    expect(written.device_id).toBe(dev)
    expect(written.time_updated).toBeGreaterThan(0)

    const getRes = await get(request)
    expect(getRes.status()).toBe(200)
    const read = await getRes.json()
    expect(read.state).toBe(blob)
    expect(read.time_updated).toBe(written.time_updated)
  })

  test("PUT with stale if_match returns 409 + current row", async ({ request }) => {
    const dev = `dev_${randomUUID().slice(0, 8)}`
    const first = await (await put(request, { state: '{"v":1}', device_id: dev })).json()
    await new Promise((r) => setTimeout(r, 5))
    const second = await (await put(request, { state: '{"v":2}', device_id: dev })).json()

    const stale = await put(request, { state: '{"v":3}', device_id: dev, if_match: first.time_updated })
    expect(stale.status()).toBe(409)
    const body = await stale.json()
    expect(body.error).toBe("conflict")
    expect(body.current.time_updated).toBe(second.time_updated)
  })

  test("PUT broadcasts a custom.client_state.updated SSE event", async ({ request }) => {
    const dev = `dev_${randomUUID().slice(0, 8)}`
    const blob = JSON.stringify({ marker: randomUUID() })

    // Open SSE stream first
    const ctrl = new AbortController()
    const sseHeaders: Record<string, string> = { accept: "text/event-stream" }
    if (auth) sseHeaders.authorization = `Basic ${Buffer.from(auth).toString("base64")}`
    const eventsP = fetch(`${base}/global/event`, { headers: sseHeaders, signal: ctrl.signal })

    const events = await eventsP
    expect(events.ok).toBe(true)

    const reader = events.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let saw = false
    const deadline = Date.now() + 8000

    // Trigger PUT after subscriber is attached
    setTimeout(() => {
      void put(request, { state: blob, device_id: dev })
    }, 200)

    while (Date.now() < deadline && !saw) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const json = line.slice(6).trim()
        if (!json) continue
        const parsed = JSON.parse(json)
        const payload = parsed.payload ?? parsed
        if (payload.type === "custom.client_state.updated") {
          expect(payload.properties.state).toBe(blob)
          expect(payload.properties.device_id).toBe(dev)
          expect(payload.properties.time_updated).toBeGreaterThan(0)
          saw = true
          break
        }
      }
    }

    ctrl.abort()
    expect(saw).toBe(true)
  })
})
