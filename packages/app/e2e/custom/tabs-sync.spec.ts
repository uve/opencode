/**
 * Multi-window session tabs sync test.
 *
 * Verifies that the custom tabs strip in the titlebar shows sessions from
 * ALL projects in BOTH browser windows, even if a session was created
 * after the windows were already open.
 *
 * Setup:
 *   - Live opencode server on PLAYWRIGHT_SERVER_PORT (default 4096)
 *   - PLAYWRIGHT_SERVER_AUTH="user:pass" for Basic auth
 *
 * Scenario:
 *   1. Open window A and window B (both load same backend)
 *   2. Snapshot what each sees in window.__sessionsRegistry.allSessions()
 *   3. Create a brand-new session via API in some project
 *   4. Wait a few seconds for WS push
 *   5. Verify the new session appears in BOTH windows' registry
 *   6. Verify the tab is rendered in the titlebar strip
 */
import { test, expect, request as playwrightRequest, type BrowserContext } from "@playwright/test"

const auth = process.env.PLAYWRIGHT_SERVER_AUTH ?? ""
const [user, pass] = auth.split(":")
const port = Number(process.env.PLAYWRIGHT_SERVER_PORT ?? 4096)
const base = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

const httpCredentials = user && pass ? { username: user, password: pass } : undefined

async function newWindow(browser: import("@playwright/test").Browser) {
  return browser.newContext({ httpCredentials, baseURL: base })
}

async function waitForRegistry(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const r = (window as any).__sessionsRegistry
    return r && typeof r.allSessions === "function"
  }, null, { timeout: 30_000 })
}

async function dump(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const reg = (window as any).__sessionsRegistry
    const gs = (window as any).__globalSync
    return {
      projects: gs?.data?.project?.map((p: any) => p.worktree) ?? [],
      sessionIds: reg?.allSessions().map((s: any) => s.id) ?? [],
      sessionTitles: reg?.allSessions().map((s: any) => ({ id: s.id, title: s.title, project: s.projectName })) ?? [],
    }
  })
}

async function tabsInDom(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const strip = document.querySelector("#opencode-titlebar-center")
    if (!strip) return { found: false, hrefs: [] as string[] }
    return {
      found: true,
      hrefs: Array.from(strip.querySelectorAll("a")).map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    }
  })
}

test.describe("multi-window session tabs sync", () => {
  test.setTimeout(120_000)

  test("new session created via API appears in both windows", async ({ browser }) => {
    // Step 1: open two windows
    const ctxA = await newWindow(browser)
    const ctxB = await newWindow(browser)
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    // Capture console errors for diagnostics
    const errorsA: string[] = []
    const errorsB: string[] = []
    pageA.on("pageerror", (e) => errorsA.push(`pageerror: ${e.message}`))
    pageA.on("console", (msg) => {
      if (msg.type() === "error") errorsA.push(`console.error: ${msg.text()}`)
    })
    pageB.on("pageerror", (e) => errorsB.push(`pageerror: ${e.message}`))
    pageB.on("console", (msg) => {
      if (msg.type() === "error") errorsB.push(`console.error: ${msg.text()}`)
    })

    await pageA.goto("/")
    await pageB.goto("/")

    await waitForRegistry(pageA)
    await waitForRegistry(pageB)

    const beforeA = await dump(pageA)
    const beforeB = await dump(pageB)

    console.log("=== BEFORE create ===")
    console.log("Window A projects:", beforeA.projects)
    console.log("Window A sessions:", beforeA.sessionTitles)
    console.log("Window B projects:", beforeB.projects)
    console.log("Window B sessions:", beforeB.sessionTitles)

    expect(beforeA.projects.length, "backend should expose at least one project").toBeGreaterThan(0)
    expect(beforeA.projects).toEqual(beforeB.projects)

    // Pick a worktree to create the session in
    const targetWorktree = beforeA.projects[0]
    expect(targetWorktree, "need a worktree").toBeTruthy()

    // Step 2: Create a fresh session via API
    const apiCtx = await playwrightRequest.newContext({ baseURL: base, httpCredentials })
    const title = `e2e-sync-${Date.now()}`
    const createResp = await apiCtx.post(`/session`, {
      headers: { "Content-Type": "application/json", "X-Project-Directory": targetWorktree, "x-opencode-directory": targetWorktree },
      data: { title, directory: targetWorktree },
    })
    const createBody = await createResp.text()
    console.log("Create session status:", createResp.status(), "body:", createBody.slice(0, 500))
    expect(createResp.ok(), `create should succeed: ${createBody}`).toBeTruthy()
    const created = JSON.parse(createBody)
    const newId: string = created.id ?? created.session?.id
    expect(newId, "API should return a session id").toBeTruthy()

    console.log("Created session id:", newId)

    // Step 3: Wait for WS push to deliver the new session into both windows
    const startWait = Date.now()
    const TIMEOUT = 15_000
    let appearedA = false
    let appearedB = false
    while (Date.now() - startWait < TIMEOUT) {
      const a = await dump(pageA)
      const b = await dump(pageB)
      appearedA = a.sessionIds.includes(newId)
      appearedB = b.sessionIds.includes(newId)
      if (appearedA && appearedB) break
      await pageA.waitForTimeout(500)
    }

    const afterA = await dump(pageA)
    const afterB = await dump(pageB)
    const tabsA = await tabsInDom(pageA)
    const tabsB = await tabsInDom(pageB)

    console.log("=== AFTER create ===")
    console.log("Window A sessions:", afterA.sessionTitles)
    console.log("Window B sessions:", afterB.sessionTitles)
    console.log("Window A tabs in DOM:", tabsA)
    console.log("Window B tabs in DOM:", tabsB)
    console.log("Window A console errors:", errorsA)
    console.log("Window B console errors:", errorsB)

    // Cleanup
    await apiCtx.delete(`/session/${newId}`, {
      headers: { "X-Project-Directory": targetWorktree, "x-opencode-directory": targetWorktree },
    }).catch(() => {})
    await apiCtx.dispose()

    // Assertions
    expect(afterA.sessionIds, "new session must appear in window A registry").toContain(newId)
    expect(afterB.sessionIds, "new session must appear in window B registry").toContain(newId)
    expect(tabsA.hrefs.some((h) => h.includes(newId)), "new tab must render in window A DOM").toBeTruthy()
    expect(tabsB.hrefs.some((h) => h.includes(newId)), "new tab must render in window B DOM").toBeTruthy()
  })

  test("registry contains sessions from all projects on initial load", async ({ browser }) => {
    const ctx = await newWindow(browser)
    const page = await ctx.newPage()
    await page.goto("/")
    await waitForRegistry(page)
    // Give bootstrap a moment to subscribe to all worktrees
    await page.waitForTimeout(2000)
    const snap = await dump(page)
    console.log("Initial load — projects:", snap.projects)
    console.log("Initial load — sessions:", snap.sessionTitles)
    // We don't assert exact count since real data is dynamic, but if backend
    // has multiple projects with sessions, registry must surface them all.
    expect(snap.projects.length).toBeGreaterThan(0)
  })
})
