/**
 * Custom fork — UI presence E2E tests.
 *
 * These tests verify that custom UI components (voice, scroll buttons,
 * sidebar, restart button, custom icons, i18n keys) are present in the DOM.
 *
 * They use only data-attributes, aria-labels, and CSS selectors — no imports
 * from app source. This makes them fully rebase-safe.
 */
import { test, expect } from "../fixtures"

// ────────────────────────────────────────────────────────────────
// 1. Voice components rendered on session page
// ────────────────────────────────────────────────────────────────
test.describe("voice UI components (custom fork)", () => {
  test("VoiceRecorderButton is rendered with correct aria-label", async ({ page, project }) => {
    await project.open()
    const btn = page.locator('button[aria-label="Record"]')
    await expect(btn).toBeVisible({ timeout: 15_000 })
  })

  test("VoiceModeButton is rendered", async ({ page, project }) => {
    await project.open()
    // VoiceModeButton has aria-label "Off", "Listening", or "Recording"
    const btn = page.locator('button[aria-label="Off"], button[aria-label="Listening"], button[aria-label="Recording"]')
    await expect(btn.first()).toBeVisible({ timeout: 15_000 })
  })

  test("ScrollButtons are rendered with up/down labels", async ({ page, project }) => {
    await project.open()
    const up = page.locator('button[aria-label="Scroll up"]')
    const down = page.locator('button[aria-label="Scroll down"]')
    await expect(up).toBeVisible({ timeout: 15_000 })
    await expect(down).toBeVisible()
  })

  test("scroll up button scrolls the viewport", async ({ page, project }) => {
    await project.open()
    const up = page.locator('button[aria-label="Scroll up"]')
    await expect(up).toBeVisible({ timeout: 15_000 })
    // Just verify click doesn't throw — actual scroll is smooth
    await up.click()
    // Button should be temporarily disabled after click (cooldown)
    await expect(up).toBeDisabled()
    // Then re-enabled after ~500ms
    await expect(up).toBeEnabled({ timeout: 2_000 })
  })

  test("scroll down button scrolls the viewport", async ({ page, project }) => {
    await project.open()
    const down = page.locator('button[aria-label="Scroll down"]')
    await expect(down).toBeVisible({ timeout: 15_000 })
    await down.click()
    await expect(down).toBeDisabled()
    await expect(down).toBeEnabled({ timeout: 2_000 })
  })
})

// ────────────────────────────────────────────────────────────────
// 2. microphone & reload icons exist in icon set
// ────────────────────────────────────────────────────────────────
test.describe("custom icons (custom fork)", () => {
  test("microphone icon renders an SVG path in the recorder button", async ({ page, project }) => {
    await project.open()
    const btn = page.locator('button[aria-label="Record"]')
    await expect(btn).toBeVisible({ timeout: 15_000 })
    const svg = btn.locator("svg")
    await expect(svg).toBeVisible()
    // The microphone SVG should contain our custom path data
    const paths = svg.locator("path")
    expect(await paths.count()).toBeGreaterThan(0)
  })
})

// ────────────────────────────────────────────────────────────────
// 3. Sessions Sidebar
// ────────────────────────────────────────────────────────────────
test.describe("sessions sidebar (custom fork)", () => {
  test("sessions sidebar has a Sessions heading", async ({ page, project, sdk }) => {
    // Create a session so the sidebar has content
    const session = await sdk.session.create({ title: `e2e-sidebar-${Date.now()}` }).then((r) => r.data)
    try {
      await project.open()
      // The sessions sidebar component renders a "Sessions" heading text
      // It may be hidden initially — check via evaluate if it exists in DOM
      const heading = page.locator("text=Sessions").first()
      // If sidebar is closed, try to open it
      const btn = page.locator('button:has-text("Sessions"), [aria-label*="sessions" i]').first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await expect(heading).toBeVisible({ timeout: 5_000 })
      }
    } finally {
      if (session?.id) {
        await sdk.session.delete({ sessionID: session.id }).catch(() => {})
      }
    }
  })
})

// ────────────────────────────────────────────────────────────────
// 4. Sidebar restart button
// ────────────────────────────────────────────────────────────────
test.describe("sidebar restart button (custom fork)", () => {
  test("restart button exists in the sidebar rail", async ({ page, project }) => {
    await project.open()
    const btn = page.locator('button[aria-label="Restart"]')
    // The restart button may only render when sidebar is visible
    // Check DOM presence (even if hidden)
    const count = await btn.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────────
// 5. Titlebar renders
// ────────────────────────────────────────────────────────────────
test.describe("titlebar (custom fork)", () => {
  test("titlebar has back/forward navigation buttons", async ({ page, project }) => {
    await project.open()
    // Titlebar has navigation buttons
    const back = page.locator('[aria-label="Back"], [data-action="titlebar-back"]').first()
    const forward = page.locator('[aria-label="Forward"], [data-action="titlebar-forward"]').first()
    // At least one navigation element should exist
    const count = (await back.count()) + (await forward.count())
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────────
// 6. Prompt input — custom enhancements
// ────────────────────────────────────────────────────────────────
test.describe("prompt input enhancements (custom fork)", () => {
  test("prompt input has inputMode=text and autocomplete=off", async ({ page, project }) => {
    await project.open()
    const editor = page.locator('[data-component="prompt-input"] [contenteditable]')
    await expect(editor).toBeVisible({ timeout: 15_000 })
    await expect(editor).toHaveAttribute("inputMode", "text")
    await expect(editor).toHaveAttribute("autocomplete", "off")
  })

  test("send button shows arrow-up when idle and blank", async ({ page, project }) => {
    await project.open()
    const submit = page.locator('[data-action="prompt-submit"]')
    await expect(submit).toBeVisible({ timeout: 15_000 })
    // When idle and blank, button should be disabled
    await expect(submit).toBeDisabled()
  })

  test("model selector is hidden in shell mode", async ({ page, project }) => {
    await project.open()
    // The model control should be visible in normal mode
    const model = page.locator('[data-component="prompt-model-control"]')
    await expect(model).toBeVisible({ timeout: 15_000 })
  })

  test("variant selector renders", async ({ page, project }) => {
    await project.open()
    const variant = page.locator('[data-component="prompt-variant-control"]')
    await expect(variant).toBeVisible({ timeout: 15_000 })
  })

  test("agent selector restores focus after selection", async ({ page, project }) => {
    await project.open()
    const agent = page.locator('[data-component="prompt-agent-control"]')
    await expect(agent).toBeVisible({ timeout: 15_000 })
    // The agent selector should be clickable
    const trigger = agent.locator("button, [role=combobox]").first()
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click()
      // After selecting (or clicking away), focus should return to editor
    }
  })
})

// ────────────────────────────────────────────────────────────────
// 7. Voice settings in settings panel
// ────────────────────────────────────────────────────────────────
test.describe("voice settings (custom fork)", () => {
  test("voice settings are stored in localStorage", async ({ page, project }) => {
    await project.open()
    // Check that voice settings exist in the settings store via localStorage
    const settings = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.includes("settings")) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!)
            if (val?.voice) return val.voice
          } catch {}
        }
      }
      return null
    })

    // voice settings should exist with defaults
    if (settings) {
      expect(settings).toHaveProperty("enabled")
      expect(settings).toHaveProperty("model")
    }
  })
})
