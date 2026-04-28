#!/usr/bin/env bash
# Build frontend + backend into a single binary and install to ~/.local/bin.
# Usage: bash cmd/build.sh
set -euo pipefail

SRC="${OPENCODE_SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
BIN="$HOME/.local/bin/opencode"
UNIT="opencode.service"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

log() { echo "[$(date)] $*"; }

# ── 0. Escape service cgroup ─────────────────────────────────────
# When this script runs as a child of the opencode service, systemd's
# KillMode=control-group will kill us when we stop the service.
# Re-exec ourselves inside a transient scope so we survive the stop.
if [ -z "${OPENCODE_BUILD_SCOPED:-}" ]; then
  CGROUP="$(cat /proc/self/cgroup 2>/dev/null || true)"
  if echo "$CGROUP" | grep -q "opencode.service"; then
    log "re-launching in transient scope to escape service cgroup..."
    LOGFILE="${SRC}/.build.log"
    export OPENCODE_BUILD_SCOPED=1
    exec systemd-run --user --scope \
      --unit="opencode-build" \
      bash "$0" "$@" </dev/null >"$LOGFILE" 2>&1
  fi
fi

cd "$SRC"
log "=== build start ==="

# ── 1. Install deps ────────────────────────────────────────────────
log "installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# ── 2. Build binary ───────────────────────────────────────────────
log "building binary..."
bun ./packages/opencode/script/build.ts --single 2>&1 | tail -5

BUILT="$(find packages/opencode/dist -name opencode -type f | head -1)"
if [ -z "$BUILT" ]; then
  log "ERROR: binary not found"
  exit 1
fi

# ── 3. Install while service is still running ────────────────────
# Linux returns ETXTBSY if you `cp` over a running binary.
# But `mv` (rename) works — the running process keeps its inode.
# So: rename old → copy new → restart picks up the new file.
mkdir -p "$(dirname "$BIN")"
if [ -f "$BIN" ]; then
  mv -f "$BIN" "${BIN}.bak"
  log "moved previous binary to backup"
fi
cp "$BUILT" "$BIN"
chmod +x "$BIN"

VERSION="$("$BIN" --version 2>/dev/null || echo unknown)"
log "installed $BIN ($VERSION)"

# ── 4. Restart service (single command = minimal downtime) ───────
systemctl --user reset-failed "$UNIT" 2>/dev/null || true
systemctl --user restart "$UNIT"
log "service restarted"

# ── 5. Health check (with rollback) ─────────────────────────────
set -a && source "$SRC/.env" 2>/dev/null && set +a || true
PORT="${PORT:-4096}"
for i in $(seq 1 60); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/global/health" 2>/dev/null || echo "000")
  if [ "$CODE" = "401" ] || [ "$CODE" = "200" ]; then
    log "health OK (HTTP $CODE)"
    break
  fi
  if [ "$i" = "60" ]; then
    log "ERROR: health check failed (HTTP $CODE)"
    if [ -f "${BIN}.bak" ]; then
      log "rolling back to previous binary..."
      cp "${BIN}.bak" "$BIN"
      systemctl --user restart "$UNIT"
      sleep 2
      log "rollback complete"
    fi
    exit 1
  fi
done

log "=== done: $VERSION ==="
