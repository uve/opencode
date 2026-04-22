/**
 * iPhone touch-swipe test for the session tabs strip — mocked variant.
 *
 * Renders a standalone HTML page that replicates EXACTLY the DOM/CSS structure
 * the real strip emits (titlebar grid, slot wrapper with pointer-events,
 * overflow strip, mobile-sized tabs). 7 mock tabs are inserted so the strip
 * overflows on iPhone width.
 *
 * Verifies:
 *   1. Strip overflows (`scrollWidth > clientWidth`).
 *   2. Computed `touch-action`, `pointer-events`, `overflow-x` allow horizontal
 *      touch scroll on iOS.
 *   3. A real CDP touch swipe moves `scrollLeft` from 0 to a positive value.
 *   4. Tapping a tab fires its click handler (no drag/click conflict).
 */
import { test, expect, devices } from "@playwright/test"

const STRIP_SELECTOR = "#opencode-titlebar-center > div"

// HTML mirrors the live structure: <header> grid > slot wrapper >
// #opencode-titlebar-center (slot) > strip (the scrollable element).
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; font-family: system-ui, sans-serif; background: #fafafa; }
  header {
    height: 40px; flex-shrink: 0; background: #fff; position: relative;
    display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center;
    border-bottom: 1px solid #ddd;
  }
  /* Left and right titlebar columns (mock) */
  header > .left, header > .right {
    display: flex; align-items: center; min-width: 0; padding: 0 8px;
  }
  header > .left  { justify-content: flex-start; }
  header > .right { justify-content: flex-end; }
  header > .left  > div { width: 32px; height: 32px; border: 1px dashed #bbb; border-radius: 4px; }
  header > .right > div { width: 32px; height: 32px; border: 1px dashed #bbb; border-radius: 4px; margin-left: 4px; }

  /* Slot wrapper — mirrors upstream titlebar.tsx:301 */
  .slot-wrapper {
    min-width: 0; display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  /* Slot — mirrors upstream titlebar.tsx:302 */
  #opencode-titlebar-center {
    pointer-events: auto; min-width: 0; display: flex; justify-content: center;
    width: fit-content; max-width: 100%;
  }

  /* OUR PATCH (injected by SessionTabsStrip onMount) */
  header > div:has(> #opencode-titlebar-center) {
    min-width: 0; overflow: hidden; pointer-events: auto !important;
  }
  #opencode-titlebar-center {
    max-width: 100% !important; width: 100% !important;
    justify-content: flex-start !important; pointer-events: auto !important;
  }

  /* Strip — mirrors session-tabs-strip.tsx:106 */
  .strip {
    display: flex; align-items: center; gap: 4px; padding: 0 8px; min-width: 0;
    overflow-x: auto; touch-action: pan-x; -webkit-overflow-scrolling: touch;
  }
  .strip::-webkit-scrollbar { display: none; }
  .strip { -ms-overflow-style: none; scrollbar-width: none; }

  .tab {
    display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px;
    flex-shrink: 0; min-width: 0; max-width: 120px;
    border: 1px dashed #999; background: #fff; cursor: pointer; user-select: none;
  }
  .tab .dot { width: 20px; height: 20px; border-radius: 50%; background: #eee; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
  .tab .title { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head>
<body>
  <header>
    <div class="left"><div></div><div></div></div>
    <div class="slot-wrapper">
      <div id="opencode-titlebar-center">
        <div class="strip" id="strip">
          <a class="tab" data-tab-id="t1" href="#t1"><span class="dot">A</span><span class="title">Alpha session</span></a>
          <a class="tab" data-tab-id="t2" href="#t2"><span class="dot">B</span><span class="title">Beta session</span></a>
          <a class="tab" data-tab-id="t3" href="#t3"><span class="dot">C</span><span class="title">Gamma session</span></a>
          <a class="tab" data-tab-id="t4" href="#t4"><span class="dot">D</span><span class="title">Delta session</span></a>
          <a class="tab" data-tab-id="t5" href="#t5"><span class="dot">E</span><span class="title">Epsilon session</span></a>
          <a class="tab" data-tab-id="t6" href="#t6"><span class="dot">F</span><span class="title">Zeta session</span></a>
          <a class="tab" data-tab-id="t7" href="#t7"><span class="dot">G</span><span class="title">Eta session</span></a>
        </div>
      </div>
    </div>
    <div class="right"><div></div><div></div></div>
  </header>
  <main></main>
  <script>
    window.__clicks = [];
    document.querySelectorAll("[data-tab-id]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        window.__clicks.push(el.getAttribute("data-tab-id"));
      });
    });
  </script>
</body></html>`

test.use({
  ...devices["Pixel 7"],
  hasTouch: true,
})

test.describe("iPhone tabs swipe (mock)", () => {
  test("strip overflows, swipes horizontally, tap fires click", async ({ page }) => {
    await page.setContent(HTML)
    await page.waitForSelector(STRIP_SELECTOR)

    const metrics = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      const cs = window.getComputedStyle(el)
      const parent = el.parentElement!
      const parentCs = window.getComputedStyle(parent)
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        tabCount: el.querySelectorAll("[data-tab-id]").length,
        touchAction: cs.touchAction,
        overflowX: cs.overflowX,
        pointerEvents: cs.pointerEvents,
        parentPointerEvents: parentCs.pointerEvents,
        slotWidth: parent.getBoundingClientRect().width,
        slotMaxWidth: parentCs.maxWidth,
      }
    }, STRIP_SELECTOR)
    console.log("metrics:", metrics)

    // ---- 1. Strip is set up correctly ----
    expect(metrics.tabCount).toBe(7)
    expect(metrics.scrollWidth, `expected overflow: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`).toBeGreaterThan(metrics.clientWidth)
    expect(metrics.touchAction).toMatch(/pan-x|auto|manipulation/)
    expect(metrics.pointerEvents).toBe("auto")
    expect(metrics.parentPointerEvents).toBe("auto")
    expect(metrics.overflowX).toMatch(/auto|scroll/)

    // ---- 2. Touch swipe right-to-left moves scrollLeft ----
    const stripBox = await page.locator(STRIP_SELECTOR).boundingBox()
    expect(stripBox).not.toBeNull()

    const beforeScroll = await page.locator(STRIP_SELECTOR).evaluate((el) => el.scrollLeft)
    expect(beforeScroll).toBe(0)

    const startX = stripBox!.x + stripBox!.width - 30
    const endX = stripBox!.x + 30
    const y = stripBox!.y + stripBox!.height / 2

    // Use CDP touch events — works on Chromium mobile emulation (Pixel 7).
    const client = await page.context().newCDPSession(page)
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] })
    const steps = 15
    for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * i) / steps
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
      await page.waitForTimeout(12)
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await page.waitForTimeout(500)

    const afterScroll = await page.locator(STRIP_SELECTOR).evaluate((el) => el.scrollLeft)
    console.log(`scrollLeft: ${beforeScroll} -> ${afterScroll}`)
    expect(afterScroll, "swipe did not scroll the strip horizontally").toBeGreaterThan(0)

    // ---- 3. Tapping a now-visible tab fires click (no drag-suppression conflict) ----
    // After swipe, late tabs (t6/t7) should now be in viewport.
    const lateTab = page.locator('[data-tab-id="t6"]')
    await lateTab.tap()
    const clicks = await page.evaluate(() => (window as any).__clicks)
    console.log("clicks:", clicks)
    expect(clicks).toContain("t6")
  })
})
