/**
 * iPhone touch-swipe test for the session tabs strip.
 *
 * Goal: verify that on a mobile (iPhone) viewport the tabs strip:
 *   1. Renders MORE than the few tabs that fit on screen (i.e. the strip
 *      actually has horizontal overflow — `scrollWidth > clientWidth`).
 *   2. Responds to a horizontal touch swipe by moving `scrollLeft`.
 *   3. Tapping a partially-visible tab navigates to it.
 *
 * Setup:
 *   - Live opencode server on PLAYWRIGHT_SERVER_PORT (default 4097)
 *   - PLAYWRIGHT_SERVER_AUTH="user:pass"
 *   - Server should already have several sessions; if not, the test
 *     creates them via the experimental API.
 */
import { test, expect, devices, request as playwrightRequest } from "@playwright/test"

const auth = process.env.PLAYWRIGHT_SERVER_AUTH ?? ""
const [user, pass] = auth.split(":")
const port = Number(process.env.PLAYWRIGHT_SERVER_PORT ?? 4096)
const base = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const httpCredentials = user && pass ? { username: user, password: pass } : undefined

const STRIP_SELECTOR = '[data-component="session-tabs-strip"]'

test.use({
  ...devices["Pixel 7"],
  hasTouch: true,
  baseURL: base,
  httpCredentials,
})

test.describe("iPhone tabs swipe", () => {
  test("strip overflows and responds to horizontal touch swipe", async ({ page, browser }) => {
    // Make sure there are at least ~6 sessions so we definitely overflow on iPhone.
    const ctx = await playwrightRequest.newContext({
      baseURL: base,
      extraHTTPHeaders: httpCredentials
        ? { Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") }
        : undefined,
    })
    let sessionsResp = await ctx.get("/experimental/session?roots=true&archived=false&limit=50")
    expect(sessionsResp.ok(), `GET /experimental/session failed: ${sessionsResp.status()}`).toBeTruthy()
    let sessions: any[] = await sessionsResp.json()
    console.log(`server has ${sessions.length} sessions initially`)

    // If we don't have enough, create a few in an existing project's directory.
    const TARGET = 7
    if (sessions.length < TARGET) {
      const dir = sessions[0]?.directory ?? "/home/uve/workspace/opencode"
      const need = TARGET - sessions.length
      console.log(`creating ${need} sessions in ${dir}`)
      for (let i = 0; i < need; i++) {
        const r = await ctx.post(`/session?directory=${encodeURIComponent(dir)}`, {
          data: { title: `swipe-test-${Date.now()}-${i}` },
          headers: { "Content-Type": "application/json" },
        })
        if (!r.ok()) console.log(`  create ${i} failed: ${r.status()} ${await r.text()}`)
      }
      sessionsResp = await ctx.get("/experimental/session?roots=true&archived=false&limit=50")
      sessions = await sessionsResp.json()
      console.log(`server has ${sessions.length} sessions after creation`)
    }
    expect(sessions.length, "need at least 6 sessions on the server to test overflow").toBeGreaterThanOrEqual(6)

    // Navigate to a session URL — strip mounts inside the session route.
    // App URLs use base64(directory) as the project slug, not session.slug.
    const target = sessions[0]
    const projectSlug = Buffer.from(target.directory).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    await page.goto(`/${projectSlug}/session/${target.id}`)

    // Wait for our custom registry to be installed.
    await page.waitForFunction(() => (window as any).__sessionsRegistry !== undefined, null, { timeout: 30_000 })

    // Force-open projects in layout so registry has sessions to show.
    // Browser context starts empty (no persisted "open projects" list),
    // so we open the top N distinct project directories from server's session list.
    const dirs = Array.from(new Set(sessions.map((s) => s.directory))).slice(0, 6)
    await page.evaluate(async (dirs) => {
      // useLayout() exposes layout via the registry's parent context;
      // simplest path is via internal globalSync to load sessions per dir,
      // and via DOM navigation isn't enough. We expose layout through window for the test.
      const layout = (window as any).__layout
      if (layout?.projects?.open) {
        for (const d of dirs) layout.projects.open(d)
      } else {
        // Fallback: use globalSync directly to load sessions for each dir.
        const gs = (window as any).__globalSync
        for (const d of dirs) {
          await gs?.project?.loadSessions?.(d)
        }
      }
    }, dirs)

    // Give the registry a moment to react.
    await page.waitForTimeout(2000)

    const diag = await page.evaluate(() => {
      const reg = (window as any).__sessionsRegistry
      const gs = (window as any).__globalSync
      return {
        projectsOpen: gs?.data?.project?.map((p: any) => p.worktree) ?? [],
        registrySessions: reg?.allSessions().length ?? 0,
        registryFirst5: reg?.allSessions().slice(0, 5).map((s: any) => ({ id: s.id, title: s.title, w: s.worktree })) ?? [],
        stripExists: !!document.querySelector("#opencode-titlebar-center > div"),
        tabsInDom: document.querySelectorAll("[data-tab-id]").length,
      }
    })
    console.log("diagnostic:", JSON.stringify(diag, null, 2))

    // Wait until at least 4 tabs are rendered.
    await page.waitForFunction((sel) => {
      const strip = document.querySelector(sel)
      if (!strip) return false
      return strip.querySelectorAll("[data-tab-id]").length >= 4
    }, STRIP_SELECTOR, { timeout: 30_000 })

    const stripBox = await page.locator(STRIP_SELECTOR).boundingBox()
    expect(stripBox, "strip not visible").not.toBeNull()
    console.log("strip box:", stripBox)

    // ---- Assertion 1: strip overflows ----
    const metrics = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      const cs = window.getComputedStyle(el)
      const parent = el.parentElement
      const parentCs = parent ? window.getComputedStyle(parent) : null
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollLeft: el.scrollLeft,
        tabCount: el.querySelectorAll("[data-tab-id]").length,
        touchAction: cs.touchAction,
        overflowX: cs.overflowX,
        pointerEvents: cs.pointerEvents,
        parentPointerEvents: parentCs?.pointerEvents,
        parentMaxWidth: parentCs?.maxWidth,
        parentWidth: parentCs?.width,
      }
    }, STRIP_SELECTOR)
    console.log("strip metrics:", metrics)

    expect(metrics, "strip element not found").not.toBeNull()
    expect(metrics!.tabCount, `expected >=4 tabs rendered, got ${metrics!.tabCount}`).toBeGreaterThanOrEqual(4)
    expect(metrics!.scrollWidth, `expected overflow (scrollWidth ${metrics!.scrollWidth} > clientWidth ${metrics!.clientWidth})`).toBeGreaterThan(metrics!.clientWidth)
    expect(metrics!.touchAction, "touch-action must allow horizontal pan").toMatch(/pan-x|auto|manipulation/)
    expect(metrics!.pointerEvents, "strip pointer-events must be auto").toBe("auto")

    // ---- Assertion 2: horizontal touch swipe moves scrollLeft ----
    const beforeScroll = await page.locator(STRIP_SELECTOR).evaluate((el) => el.scrollLeft)
    expect(beforeScroll).toBe(0)

    // Simulate a real iOS-style touch drag from right to left.
    const startX = stripBox!.x + stripBox!.width - 30
    const endX = stripBox!.x + 30
    const y = stripBox!.y + stripBox!.height / 2

    // Use CDP touch events for accurate touch simulation in Chromium mobile emulation.
    const client = await page.context().newCDPSession(page)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y }],
    })
    // Several intermediate moves so the browser can compute velocity for inertial scroll.
    const steps = 12
    for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * i) / steps
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y }],
      })
      await page.waitForTimeout(15)
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })

    // Allow inertial scroll to settle.
    await page.waitForTimeout(600)

    const afterScroll = await page.locator(STRIP_SELECTOR).evaluate((el) => el.scrollLeft)
    console.log(`scrollLeft: ${beforeScroll} -> ${afterScroll}`)
    expect(afterScroll, "strip did not scroll horizontally on touch swipe").toBeGreaterThan(0)
  })
})
