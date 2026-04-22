/**
 * Playwright config for custom fork E2E tests.
 *
 * Runs against a live opencode server (no dev server spawn).
 * Configure via env vars:
 *   PLAYWRIGHT_BASE_URL — app URL (default: http://127.0.0.1:4096)
 *   PLAYWRIGHT_SERVER_URL — API URL (default: same as base)
 *   PLAYWRIGHT_SERVER_PORT — API port (default: 4096)
 *   PLAYWRIGHT_SERVER_AUTH — "user:pass" for Basic auth
 */
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_SERVER_PORT ?? 4096)
const base = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./e2e/custom",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e/custom/test-results",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ["html", { outputFolder: "e2e/custom/playwright-report", open: "never" }],
    ["line"],
  ],
  use: {
    baseURL: base,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api-tests",
      testMatch: "custom-api.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "voice-state-unit",
      testMatch: "custom-voice-state.spec.ts",
    },
    {
      name: "build-smoke",
      testMatch: ["custom-build.spec.ts", "custom-inventory.spec.ts"],
    },
    {
      name: "ui-chromium",
      testMatch: "custom-ui.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
            "--allow-insecure-localhost",
          ],
        },
      },
    },
    {
      name: "tabs-sync",
      testMatch: "tabs-sync.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "tabs-iphone-swipe",
      testMatch: "tabs-iphone-swipe.spec.ts",
      use: {
        ...devices["iPhone 15"],
        hasTouch: true,
      },
    },
    {
      name: "tabs-iphone-swipe-mock",
      testMatch: "tabs-iphone-swipe-mock.spec.ts",
      use: {
        ...devices["iPhone 15"],
        hasTouch: true,
      },
    },
  ],
})
