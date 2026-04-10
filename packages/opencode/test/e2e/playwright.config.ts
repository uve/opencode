import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "realtime.pw.ts",
  timeout: 60000,
  retries: 0,
  use: {
    browserName: "chromium",
    headless: true,
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--unsafely-treat-insecure-origin-as-secure=http://localhost:0",
        "--allow-insecure-localhost",
      ],
    },
  },
})
