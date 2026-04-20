#!/usr/bin/env bash
# Verify that custom patches survive rebase.
# Run after every rebase: bash cmd/verify-custom.sh
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
FAIL=0
WARN=0

check() {
  local label="$1" file="$2" pattern="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $label"
  else
    echo -e "${RED}✗${NC} $label  ($file missing: $pattern)"
    FAIL=1
  fi
}

check_file() {
  local label="$1" file="$2"
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $label"
  else
    echo -e "${RED}✗${NC} $label  (file missing: $file)"
    FAIL=1
  fi
}

check_no() {
  local label="$1" file="$2" pattern="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${YELLOW}!${NC} $label  ($file still contains: $pattern)"
    WARN=1
  else
    echo -e "${GREEN}✓${NC} $label"
  fi
}

echo "=== Verifying custom patches ==="

echo ""
echo "--- 1. Voice / Microphone ---"
check_file "voice-state module"          "packages/app/src/components/prompt-input/voice-state.ts"
check_file "realtime module"             "packages/app/src/components/prompt-input/realtime.ts"
check      "voice-state import"          "packages/app/src/components/prompt-input.tsx"  "voice-state"
check      "toggleRecording function"    "packages/app/src/components/prompt-input.tsx"  "toggleRecording"
check      "prompt-record button"        "packages/app/src/components/prompt-input.tsx"  "prompt-record"
check      "prompt-realtime button"      "packages/app/src/components/prompt-input.tsx"  "prompt-realtime"
check      "Spinner import"              "packages/app/src/components/prompt-input.tsx"  "Spinner"
check      "showToast import"            "packages/app/src/components/prompt-input.tsx"  "showToast"
check      "voice settings"             "packages/app/src/context/settings.tsx"         "voice"
check      "i18n: prompt.action.record"  "packages/app/src/i18n/en.ts"                  "prompt.action.record"
check      "microphone icon"             "packages/ui/src/components/icon.tsx"            "microphone"
check      "reload icon"                 "packages/ui/src/components/icon.tsx"            "reload"
check      "headphones icon"             "packages/ui/src/components/icon.tsx"            "headphones"

echo ""
echo "--- 2. Provider Filter ---"
check      "github-copilot filter"       "packages/opencode/src/provider/provider.ts"   "github-copilot"
check      "ALLOWED_MODELS"              "packages/opencode/src/provider/provider.ts"   "ALLOWED_MODELS"

echo ""
echo "--- 3. Experimental Routes ---"
check      "transcribe endpoint"         "packages/opencode/src/server/routes/experimental.ts"  "transcribe"
check      "restart endpoint"            "packages/opencode/src/server/routes/experimental.ts"  "experimental.restart"
check      "version endpoint"            "packages/opencode/src/server/routes/experimental.ts"  "experimental.version"

echo ""
echo "--- 4. Sessions Sidebar (Web) ---"
check_file "sessions-sidebar component"  "packages/app/src/pages/layout/sessions-sidebar.tsx"
check_file "sessions-sidebar test"       "packages/app/src/pages/layout/sessions-sidebar.test.ts"
check      "sessionsSidebar state"       "packages/app/src/context/layout.tsx"           "sessionsSidebar"
check      "sessionsSidebar toggle cmd"  "packages/app/src/pages/layout.tsx"             "sessionsSidebar.toggle"
check      "SessionsSidebar import"      "packages/app/src/pages/layout.tsx"             "sessions-sidebar"
check      "main-right CSS var"          "packages/app/src/pages/layout.tsx"             "main-right"
check      "sessions_sidebar_toggle"     "packages/opencode/src/config/config.ts"        "sessions_sidebar_toggle"

echo ""
echo "--- 5. Sessions Sidebar (TUI) ---"
check_file "TUI sidebar-sessions"        "packages/opencode/src/cli/cmd/tui/routes/session/sidebar-sessions.tsx"
check      "TUI SessionsSidebar import"  "packages/opencode/src/cli/cmd/tui/routes/session/index.tsx"  "sidebar-sessions"
check      "TUI sessionsSidebar signal"  "packages/opencode/src/cli/cmd/tui/routes/session/index.tsx"  "sessionsSidebar"

echo ""
echo "--- 6. Titlebar ---"
check      "version display"             "packages/app/src/components/titlebar.tsx"      "server.health"
check      "timestamp display"           "packages/app/src/components/titlebar.tsx"      "timestamp()"
check      "createResource import"       "packages/app/src/components/titlebar.tsx"      "createResource"
check      "sessions toggle button"      "packages/app/src/components/titlebar.tsx"      "sessionsSidebar"

echo ""
echo "--- 7. Sidebar Extras ---"
check      "restart button"              "packages/app/src/pages/layout/sidebar-shell.tsx"  "onRestart"
check      "onNavigate prop"             "packages/app/src/pages/layout/sidebar-items.tsx"  "onNavigate"
check      "mobileSidebar.hide"          "packages/app/src/pages/layout/sidebar-items.tsx"  "mobileSidebar.hide"

echo ""
echo "--- 8. Icons ---"
check      "sidebar-right icon"          "packages/ui/src/components/icon.tsx"            "sidebar-right"
check      "sidebar-right-active icon"   "packages/ui/src/components/icon.tsx"            "sidebar-right-active"

echo ""
echo "--- 9. Permission Auto-accept ---"
check      "autoAccept default"          "packages/app/src/context/permission.tsx"       "autoAccept\[key\]"
# The auto-accept createEffect should NOT be gated on config.permission === "allow"
# (isPermissionAllowAll method is a separate thing and is fine)
check_no   "no conditional auto-accept"  "packages/app/src/context/permission.tsx"       'perm === "allow".*autoAccept'

echo ""
echo "--- 10. Question Dock Fix ---"
check      "80dvh max height"            "packages/ui/src/components/message-part.css"   "80dvh"
check      "viewport fallback"           "packages/app/src/pages/session/composer/session-question-dock.tsx"  "getBoundingClientRect"

echo ""
echo "--- 11. Session Header ---"
check      "createResource import"       "packages/app/src/components/session/session-header.tsx"  "createResource"

echo ""
echo "--- 12. Static File Serving ---"
check      "OPENCODE_APP_DIR"            "packages/opencode/src/server/instance.ts"      "OPENCODE_APP_DIR"
check      "serveStatic import"          "packages/opencode/src/server/instance.ts"      "serveStatic"

echo ""
echo "--- 13. Bootstrap API Key Check ---"
check      "OPENAI_API_KEY check"        "packages/opencode/src/project/bootstrap.ts"    "OPENAI_API_KEY"

echo ""
echo "--- 14. Models Snapshot ---"
check_file "models-snapshot.ts"          "packages/opencode/src/provider/models-snapshot.ts"
check_file "models-snapshot.js"          "packages/opencode/src/provider/models-snapshot.js"
check_file "models-snapshot.d.ts"        "packages/opencode/src/provider/models-snapshot.d.ts"

echo ""
echo "--- 15. Server Scripts ---"
check_file "autoupdate.sh"               "cmd/autoupdate.sh"
check_file "build.sh"                    "cmd/build.sh"
check_file "verify-custom.sh"            "cmd/verify-custom.sh"
check_file "opencode.service"            "cmd/opencode.service"
check_file "setup-service.sh"            "cmd/setup-service.sh"

echo ""
echo "--- 16. Sound Utilities ---"
check      "iOS audio unlock"            "packages/app/src/utils/sound.ts"              "unlock"
check      "shared audio element"        "packages/app/src/utils/sound.ts"              "shared"

echo ""
echo "=== Summary ==="
if [ "$FAIL" -eq 1 ]; then
  echo -e "${RED}FAILED — some custom patches are missing!${NC}"
  echo "Run /update in OpenCode for AI-assisted repair."
  exit 1
elif [ "$WARN" -eq 1 ]; then
  echo -e "${YELLOW}WARNINGS — some patches may need review.${NC}"
  exit 0
else
  echo -e "${GREEN}ALL custom patches verified.${NC}"
fi
