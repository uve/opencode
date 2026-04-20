import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
const command = `bun run dev -- --host 0.0.0.0 --port ${port}`
const reuse = !process.env.CI
const wav = process.env.REALTIME_WAV ?? "/tmp/math-question.wav"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "prompt/prompt-realtime.spec.ts",
  outputDir: "./e2e/test-results-realtime",
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["html", { outputFolder: "e2e/playwright-report-realtime", open: "never" }], ["line"]],
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: reuse,
    timeout: 120_000,
    env: {
      VITE_OPENCODE_SERVER_HOST: serverHost,
      VITE_OPENCODE_SERVER_PORT: serverPort,
    },
  },
  use: {
    baseURL,
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  projects: [
    {
      name: "chromium-realtime",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-audio-capture=${wav}`,
            "--autoplay-policy=no-user-gesture-required",
            "--allow-insecure-localhost",
          ],
        },
      },
    },
  ],
})
