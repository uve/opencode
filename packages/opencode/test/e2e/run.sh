#!/usr/bin/env bash
set -euo pipefail

# Run realtime tests inside Docker (Playwright image + Bun)
# Usage: ./test/e2e/run.sh [--build] [--mock] [--e2e] [--browser] [--n2n] [--ui]
#
# Options:
#   --build    Force rebuild Docker image
#   --mock     Run mock unit tests (realtime.test.ts)
#   --e2e      Run WebSocket E2E test (realtime-e2e.test.ts)
#   --browser  Run Playwright browser WebRTC test (realtime.pw.ts)
#   --n2n      Run N2N audio round-trip test (generate TTS + Playwright)
#   --ui       Run full UI E2E test (real backend + frontend + Chromium)
#   (no flags) Run mock, e2e, browser, n2n (not ui)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
IMAGE="opencode-realtime-test"

RUN_MOCK=false
RUN_E2E=false
RUN_BROWSER=false
RUN_N2N=false
RUN_UI=false
FORCE_BUILD=false
RUN_ALL=true

for arg in "$@"; do
  case $arg in
    --build)   FORCE_BUILD=true ;;
    --mock)    RUN_MOCK=true; RUN_ALL=false ;;
    --e2e)     RUN_E2E=true; RUN_ALL=false ;;
    --browser) RUN_BROWSER=true; RUN_ALL=false ;;
    --n2n)     RUN_N2N=true; RUN_ALL=false ;;
    --ui)      RUN_UI=true; RUN_ALL=false ;;
  esac
done

if $RUN_ALL; then
  RUN_MOCK=true
  RUN_E2E=true
  RUN_BROWSER=true
  RUN_N2N=true
fi

# Check API key
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY is not set"
  exit 1
fi

# Build image if needed
if $FORCE_BUILD || ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "==> Building Docker image..."
  docker build -t "$IMAGE" -f "$SCRIPT_DIR/Dockerfile" "$REPO_ROOT"
fi

DOCKER_RUN="docker run --rm -e OPENAI_API_KEY=$OPENAI_API_KEY"
EXIT=0

# 1. Mock tests
if $RUN_MOCK; then
  echo ""
  echo "========================================="
  echo "  Mock tests (realtime.test.ts)"
  echo "========================================="
  $DOCKER_RUN "$IMAGE" \
    bun test test/server/realtime.test.ts --timeout 30000 \
    || EXIT=1
fi

# 2. WebSocket E2E test
if $RUN_E2E; then
  echo ""
  echo "========================================="
  echo "  WebSocket E2E (realtime-e2e.test.ts)"
  echo "========================================="
  # preload.ts deletes OPENAI_API_KEY; write it to the fallback file the test reads
  $DOCKER_RUN "$IMAGE" \
    bash -c 'echo "$OPENAI_API_KEY" > /tmp/.opencode-test-openai-key && bun test test/server/realtime-e2e.test.ts --timeout 30000' \
    || EXIT=1
fi

# 3. Playwright browser WebRTC test
if $RUN_BROWSER; then
  echo ""
  echo "========================================="
  echo "  Playwright browser WebRTC (realtime.pw.ts)"
  echo "========================================="
  $DOCKER_RUN "$IMAGE" \
    bunx playwright test --config test/e2e/playwright.config.ts \
    || EXIT=1
fi

# 4. N2N audio round-trip test
if $RUN_N2N; then
  echo ""
  echo "========================================="
  echo "  N2N audio round-trip (realtime-n2n.pw.ts)"
  echo "========================================="
  # Step 1: Generate TTS audio WAV file
  # Step 2: Run Playwright test with fake audio capture from that WAV
  $DOCKER_RUN "$IMAGE" \
    bash -c 'bun test/e2e/generate-audio.ts && bunx playwright test --config test/e2e/playwright-n2n.config.ts' \
    || EXIT=1
fi

# 5. Full UI E2E test (real backend + frontend + Chromium)
if $RUN_UI; then
  echo ""
  echo "========================================="
  echo "  Full UI E2E (prompt-realtime.spec.ts)"
  echo "========================================="
  # Uses separate Docker image with Playwright 1.57 (matching packages/app)
  UI_IMAGE="opencode-realtime-ui-test"
  if $FORCE_BUILD || ! docker image inspect "$UI_IMAGE" &>/dev/null; then
    echo "==> Building UI Docker image..."
    docker build -t "$UI_IMAGE" -f "$REPO_ROOT/packages/app/e2e/Dockerfile" "$REPO_ROOT"
  fi
  docker run --rm -e OPENAI_API_KEY="$OPENAI_API_KEY" "$UI_IMAGE" \
    bash -c '
      set -euo pipefail
      cd /app/packages/opencode
      bun test/e2e/generate-audio.ts
      echo "==> Starting backend..."
      bun run --conditions=browser ./src/index.ts serve --port 4096 &
      BACKEND_PID=$!
      for i in $(seq 1 60); do
        curl -sf http://127.0.0.1:4096/global/health > /dev/null 2>&1 && break
        [ $i -eq 60 ] && { echo "Backend timeout"; kill $BACKEND_PID 2>/dev/null; exit 1; }
        sleep 1
      done
      echo "==> Running Playwright..."
      cd /app/packages/app
      PLAYWRIGHT_SERVER_HOST=127.0.0.1 \
      PLAYWRIGHT_SERVER_PORT=4096 \
      PLAYWRIGHT_PORT=4444 \
      REALTIME_WAV=/tmp/math-question.wav \
      bunx playwright test --config playwright-realtime.config.ts
      EXIT=$?
      kill $BACKEND_PID 2>/dev/null || true
      exit $EXIT
    ' \
    || EXIT=1
fi

echo ""
if [ $EXIT -eq 0 ]; then
  echo "All tests passed!"
else
  echo "Some tests FAILED"
fi
exit $EXIT
