#!/usr/bin/env bash
# Run custom fork E2E tests.
#
# Usage:
#   bash packages/app/e2e/custom/run.sh                       # against live server
#   PLAYWRIGHT_SERVER_PORT=4096 bash packages/app/e2e/custom/run.sh
#
# Docker:
#   docker build -f packages/app/e2e/custom/Dockerfile -t opencode-e2e-custom .
#   docker run --rm --network host \
#     -e PLAYWRIGHT_SERVER_PORT=4096 \
#     -e PLAYWRIGHT_SERVER_AUTH="opencode:515164" \
#     opencode-e2e-custom
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$APP_DIR"

echo "=== Custom Fork E2E Tests ==="
echo "Server: ${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:${PLAYWRIGHT_SERVER_PORT:-4096}}"
echo ""

# Run build/source smoke tests first (no browser needed)
echo "── Phase 1: Source verification & build smoke tests ──"
npx playwright test --config=playwright-custom.config.ts --project=voice-state-unit --project=build-smoke "$@"

# Then API tests
echo ""
echo "── Phase 2: API endpoint tests ──"
npx playwright test --config=playwright-custom.config.ts --project=api-tests "$@"

# Then UI tests (need browser)
echo ""
echo "── Phase 3: UI presence tests ──"
npx playwright test --config=playwright-custom.config.ts --project=ui-chromium "$@"

echo ""
echo "=== All custom fork tests passed ==="
