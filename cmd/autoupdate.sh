#!/usr/bin/env bash
# Fetch upstream/dev, apply custom patch on top, rebuild and deploy.
# Strategy: save patch → reset to upstream → apply patch → verify → deploy.
# If patch fails, abort and tell the user to run /update for AI-assisted resolution.
# Usage: bash cmd/autoupdate.sh
set -euo pipefail

cd "$(dirname "$0")/.."

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { echo "[$(date)] $*"; }

# File lock — prevent parallel runs (auto-expire after 30 min)
LOCKDIR="/tmp/opencode-autoupdate.lock"
if [ -d "$LOCKDIR" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -gt 1800 ]; then
    log "removing stale lock (age: ${LOCK_AGE}s)"
    rmdir "$LOCKDIR" 2>/dev/null || true
  fi
fi
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  log "another autoupdate is already running, exiting"
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

log "=== autoupdate start ==="

# ── 0. Clean up any leftover rebase state ────────────────────────
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  log "WARNING: stale rebase state found, aborting"
  git rebase --abort 2>/dev/null || true
fi

# ── 1. Amend local changes into top commit ───────────────────────
log "amending local changes..."
git add -A
if ! git diff --cached --quiet 2>/dev/null; then
  git commit --amend --no-edit
  log "changes amended"
else
  log "no changes to amend"
fi

# ── 2. Save current custom patch ─────────────────────────────────
PATCH="/tmp/opencode-fork-patch.diff"
MSG="/tmp/opencode-fork-message.txt"
log "saving custom patch..."
git diff HEAD~1 HEAD > "$PATCH"
git log -1 --format='%s' > "$MSG"
PATCH_LINES=$(wc -l < "$PATCH")
log "patch saved ($PATCH_LINES lines)"

# ── 3. Fetch upstream ────────────────────────────────────────────
log "fetching upstream/dev..."
git fetch upstream dev

# ── 4. Check if update needed ────────────────────────────────────
BASE=$(git rev-parse HEAD~1)
UPSTREAM=$(git rev-parse upstream/dev)
if [ "$BASE" = "$UPSTREAM" ]; then
  log "already up to date (base=$BASE)"
  log "=== autoupdate complete (no changes) ==="
  exit 0
fi

NEW_COMMITS=$(git log "$BASE".."$UPSTREAM" --oneline | wc -l)
log "upstream has $NEW_COMMITS new commits"

# ── 5. Reset to upstream/dev ─────────────────────────────────────
OLD_HEAD=$(git rev-parse HEAD)
log "resetting to upstream/dev ($UPSTREAM)..."
git reset --hard upstream/dev

# ── 6. Apply custom patch ────────────────────────────────────────
log "applying custom patch..."
if git apply --3way "$PATCH" 2>/tmp/opencode-apply.log; then
  log "patch applied cleanly"
else
  log "patch apply failed with --3way, trying --reject..."
  git reset --hard upstream/dev

  if git apply --reject --whitespace=fix "$PATCH" 2>/tmp/opencode-reject.log; then
    log "patch applied with some rejects"
  else
    log "patch applied with rejects (some hunks failed)"
  fi

  # Check for .rej files
  REJECTS=$(find . -name '*.rej' -not -path './.git/*' 2>/dev/null || true)
  if [ -n "$REJECTS" ]; then
    log "ERROR: unresolved reject files:"
    echo "$REJECTS" | while read -r f; do log "  $f"; done
    log ""
    log "MANUAL RESOLUTION REQUIRED."
    log "Run /update in OpenCode for AI-assisted conflict resolution."
    log "Or restore previous state: git reset --hard $OLD_HEAD"
    # Clean up rejects
    echo "$REJECTS" | xargs rm -f 2>/dev/null || true
    git reset --hard "$OLD_HEAD"
    exit 1
  fi
fi

# ── 7. Install deps (regenerate lockfile) ────────────────────────
log "installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# ── 8. Commit as single commit ───────────────────────────────────
log "committing..."
git add -A
COMMIT_MSG=$(cat "$MSG")
git commit -m "$COMMIT_MSG"

# ── 9. Verify custom patches ────────────────────────────────────
log "verifying custom patches..."
if bash cmd/verify-custom.sh; then
  log "all custom patches verified"
else
  log "WARNING: some custom patches are missing!"
  log "Run /update in OpenCode for AI-assisted repair."
  log "Or restore previous state: git reset --hard $OLD_HEAD"
  # Don't abort — deploy anyway, but warn
fi

# ── 10. Push ─────────────────────────────────────────────────────
log "pushing to origin..."
git push origin main --force-with-lease 2>/dev/null || log "WARNING: push failed (will retry next run)"

# ── 11. Build & deploy ───────────────────────────────────────────
log "running build..."
bash cmd/build.sh

log "=== autoupdate complete ==="
