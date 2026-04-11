import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "realtime-n2n.pw.ts",
  timeout: 120000,
  retries: 0,
  use: {
    browserName: "chromium",
    headless: true,
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--use-file-for-fake-audio-capture=/tmp/math-question.wav",
        "--autoplay-policy=no-user-gesture-required",
        "--unsafely-treat-insecure-origin-as-secure=http://localhost:0",
        "--allow-insecure-localhost",
      ],
    },
  },
})
