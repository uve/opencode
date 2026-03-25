#!/usr/bin/env bash
# Fetch upstream, rebase local changes, rebuild and deploy.
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

# ── 2. Fetch upstream ───────────────────────────────────────────
log "fetching upstream/dev..."
git fetch upstream dev

# ── 3. Rebase onto upstream/dev ──────────────────────────────────
log "rebasing onto upstream/dev..."
if git rebase upstream/dev; then
  log "rebase succeeded"
else
  log "rebase conflict — auto-resolving lockfiles..."

  MAX=10
  for i in $(seq 1 $MAX); do
    [ ! -d .git/rebase-merge ] && [ ! -d .git/rebase-apply ] && break

    CONFLICTS=$(git diff --name-only --diff-filter=U || true)
    if [ -z "$CONFLICTS" ]; then
      GIT_EDITOR=true git rebase --continue && break || continue
    fi

    log "attempt $i/$MAX — conflicts: $CONFLICTS"

    # auto-resolve lockfiles
    for f in $CONFLICTS; do
      case "$f" in
        bun.lock|*/bun.lock|package-lock.json|*/package-lock.json)
          git checkout --theirs "$f" && git add "$f"
          log "auto-resolved lockfile: $f"
          ;;
      esac
    done

    # remaining conflicts — abort if can't resolve
    REMAINING=$(git diff --name-only --diff-filter=U || true)
    if [ -n "$REMAINING" ]; then
      log "ERROR: unresolved conflicts: $REMAINING"
      git rebase --abort
      exit 1
    fi

    GIT_EDITOR=true git rebase --continue 2>/dev/null || true
  done

  log "rebase complete"
fi

# ── 4. Build & deploy ───────────────────────────────────────────
log "running deploy..."
bash cmd/deploy.sh

log "=== autoupdate complete ==="
