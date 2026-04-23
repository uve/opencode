// custom-fork: tests for GitHub Copilot enterprise discovery + CLI impersonation.
//
// Covers the logic restored after upstream PR #20533 removed the custom
// plugin/copilot.ts. Without this logic the enterprise-only model
// `claude-opus-4.6-1m` fails with "model not supported" because:
//   1) without discovery we talk to api.githubcopilot.com, not the
//      enterprise host that actually serves the 1M model, and
//   2) without CLI impersonation headers the enterprise endpoint rejects us.
import { afterEach, describe, expect, mock, test } from "bun:test"
import { CopilotAuthPlugin } from "@/plugin/github-copilot/copilot"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function makeHooks() {
  return CopilotAuthPlugin({
    client: {} as never,
    project: {} as never,
    directory: "",
    worktree: "",
    experimental_workspace: { register() {} },
    serverUrl: new URL("https://example.com"),
    $: {} as never,
  })
}

describe("enterprise discovery", () => {
  test("fetches /copilot_internal/user with CLI UA and uses discovered endpoint", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    globalThis.fetch = mock((req: RequestInfo | URL, init?: RequestInit) => {
      const url = req instanceof URL ? req.href : typeof req === "string" ? req : (req as Request).url
      const headers: Record<string, string> = {}
      const h = init?.headers as Record<string, string> | undefined
      if (h) for (const k of Object.keys(h)) headers[k] = h[k]
      calls.push({ url, headers })
      if (url.includes("/copilot_internal/user")) {
        return Promise.resolve(
          new Response(JSON.stringify({ endpoints: { api: "https://api.enterprise.githubcopilot.com" } }), {
            status: 200,
          }),
        )
      }
      if (url.endsWith("/models")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  model_picker_enabled: true,
                  id: "claude-opus-4.6",
                  name: "Claude Opus 4.6",
                  version: "claude-opus-4.6-2026-02-05",
                  capabilities: {
                    family: "claude-opus",
                    limits: { max_context_window_tokens: 144000, max_output_tokens: 64000, max_prompt_tokens: 128000 },
                    supports: { streaming: true, tool_calls: true },
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }) as unknown as typeof fetch

    const hooks = await makeHooks()
    const models = await hooks.provider!.models!(
      {
        id: "github-copilot",
        models: {
          "claude-opus-4.6": {
            id: "claude-opus-4.6",
            providerID: "github-copilot",
            api: { id: "claude-opus-4.6", url: "https://api.githubcopilot.com", npm: "@ai-sdk/github-copilot" },
          },
        },
      } as never,
      { auth: { type: "oauth", refresh: "tok", access: "tok", expires: Date.now() + 60_000 } as never },
    )

    const discovery = calls.find((c) => c.url.includes("/copilot_internal/user"))
    expect(discovery).toBeDefined()
    expect(discovery!.headers["Authorization"]).toBe("Bearer tok")
    expect(discovery!.headers["User-Agent"]).toMatch(/^copilot\/\d+\.\d+\.\d+ \(client\/github\/cli /)

    const modelsCall = calls.find((c) => c.url.endsWith("/models"))
    expect(modelsCall).toBeDefined()
    expect(modelsCall!.url.startsWith("https://api.enterprise.githubcopilot.com")).toBe(true)
    expect(modelsCall!.headers["Copilot-Integration-Id"]).toBe("copilot-developer-cli")
    expect(modelsCall!.headers["X-GitHub-Api-Version"]).toBe("2026-01-09")

    expect(models["claude-opus-4.6"].api.url).toBe("https://api.enterprise.githubcopilot.com")
  })

  test("skips discovery when enterpriseUrl is explicitly set", async () => {
    const calls: string[] = []
    globalThis.fetch = mock((req: RequestInfo | URL) => {
      const url = req instanceof URL ? req.href : typeof req === "string" ? req : (req as Request).url
      calls.push(url)
      if (url.includes("/copilot_internal/user")) return Promise.reject(new Error("should not be called"))
      if (url.endsWith("/models"))
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      return Promise.reject(new Error(`unexpected: ${url}`))
    }) as unknown as typeof fetch

    const hooks = await makeHooks()
    await hooks.provider!.models!(
      { id: "github-copilot", models: {} } as never,
      {
        auth: {
          type: "oauth",
          refresh: "tok",
          access: "tok",
          expires: Date.now() + 60_000,
          enterpriseUrl: "ghe.example.com",
        } as never,
      },
    )

    expect(calls.some((u) => u.includes("/copilot_internal/user"))).toBe(false)
    expect(calls.some((u) => u === "https://copilot-api.ghe.example.com/models")).toBe(true)
  })
})

describe("CLI impersonation headers", () => {
  test("auth loader fetch injects all required Copilot CLI headers", async () => {
    const captured: { headers: Record<string, string>; url: string }[] = []
    globalThis.fetch = mock((req: RequestInfo | URL, init?: RequestInit) => {
      const url = req instanceof URL ? req.href : typeof req === "string" ? req : (req as Request).url
      const headers = (init?.headers as Record<string, string>) ?? {}
      captured.push({ url, headers })
      return Promise.resolve(new Response("{}", { status: 200 }))
    }) as unknown as typeof fetch

    const hooks = await makeHooks()
    const getAuth = async () =>
      ({ type: "oauth", refresh: "tok-ref", access: "tok-acc", expires: Date.now() + 60_000 }) as never
    const loaded = await hooks.auth!.loader!(getAuth, undefined as never)
    expect(loaded.fetch).toBeDefined()

    await loaded.fetch!("https://api.enterprise.githubcopilot.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json" },
    })

    expect(captured).toHaveLength(1)
    const h = captured[0].headers
    expect(h["User-Agent"]).toMatch(/^copilot\/\d+\.\d+\.\d+ \(client\/github\/cli /)
    expect(h["Authorization"]).toBe("Bearer tok-ref")
    expect(h["Copilot-Integration-Id"]).toBe("copilot-developer-cli")
    expect(h["X-GitHub-Api-Version"]).toBe("2026-01-09")
    expect(h["Openai-Intent"]).toBe("conversation-agent")
    expect(h["X-Interaction-Id"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(h["X-Agent-Task-Id"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(h["X-Client-Session-Id"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(h["X-Client-Machine-Id"]).toMatch(/^[0-9a-f-]{36}$/)
    // x-initiator preserved (lowercase, upstream convention)
    expect(h["x-initiator"]).toBe("user")
    // lowercase authorization stripped so it doesn't shadow the cased one
    expect(h["authorization"]).toBeUndefined()
  })

  test("marks agent requests via X-Interaction-Type", async () => {
    const captured: Record<string, string>[] = []
    globalThis.fetch = mock((_req: RequestInfo | URL, init?: RequestInit) => {
      captured.push((init?.headers as Record<string, string>) ?? {})
      return Promise.resolve(new Response("{}", { status: 200 }))
    }) as unknown as typeof fetch

    const hooks = await makeHooks()
    const loaded = await hooks.auth!.loader!(
      async () => ({ type: "oauth", refresh: "t", access: "t", expires: Date.now() + 60_000 }) as never,
      undefined as never,
    )

    // last message role !== "user" → isAgent = true
    await loaded.fetch!("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" },
        ],
      }),
    })

    expect(captured[0]["X-Interaction-Type"]).toBe("conversation-agent")
  })
})

// Live integration test — only runs when OPENCODE_COPILOT_LIVE_AUTH points at
// a real auth.json (e.g. `$HOME/.local/share-dev/opencode/auth.json`).
// Validates the full stack: discovery + CLI headers → real enterprise endpoint
// serves claude-opus-4.6-1m successfully.
describe("real GitHub Copilot integration", () => {
  const authPath = process.env.OPENCODE_COPILOT_LIVE_AUTH
  const authFile = authPath ? Bun.file(authPath) : undefined

  test("claude-opus-4.6-1m accepts a real request via discovered enterprise endpoint", async () => {
    if (!authFile || !(await authFile.exists())) {
      console.log(`[skip] set OPENCODE_COPILOT_LIVE_AUTH=/path/to/auth.json to enable`)
      return
    }
    const auth = (await authFile.json()) as { "github-copilot"?: { type?: string; refresh?: string } }
    const refresh = auth["github-copilot"]?.refresh
    if (auth["github-copilot"]?.type !== "oauth" || !refresh) {
      console.log("[skip] no oauth refresh token for github-copilot")
      return
    }

    // 1. Discover enterprise API endpoint exactly like the plugin does.
    const cliUserAgent = `copilot/1.0.16 (client/github/cli ${process.platform} ${process.version}) term/unknown`
    const discoveryResp = await fetch("https://api.github.com/copilot_internal/user", {
      headers: {
        Authorization: `Bearer ${refresh}`,
        Accept: "application/json",
        "User-Agent": cliUserAgent,
      },
    })
    expect(discoveryResp.ok).toBe(true)
    const discovery = (await discoveryResp.json()) as {
      endpoints?: { api?: string }
      copilot_plan?: string
    }
    expect(discovery.endpoints?.api).toBeDefined()
    // Enterprise users get the enterprise host back; others get the default.
    const apiBase = discovery.endpoints!.api!

    // 2. Call the discovered endpoint with CLI impersonation headers using the
    //    model under test. Uses the long-lived refresh directly (matches how
    //    the plugin's auth.loader().fetch behaves).
    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${refresh}`,
        "Content-Type": "application/json",
        "User-Agent": cliUserAgent,
        "Copilot-Integration-Id": "copilot-developer-cli",
        "X-GitHub-Api-Version": "2026-01-09",
        "Openai-Intent": "conversation-agent",
        "X-Initiator": "user",
        "X-Interaction-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        model: "claude-opus-4.6-1m",
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 10,
        stream: false,
      }),
    })

    const body = await resp.text()
    if (!resp.ok) {
      throw new Error(`Copilot ${apiBase} → ${resp.status}: ${body.slice(0, 500)}`)
    }
    const parsed = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }
    expect(parsed.choices?.[0]?.message?.content).toBeDefined()
  }, 30_000)
})
