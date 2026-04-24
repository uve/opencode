#!/usr/bin/env bash
# Build frontend + backend into a single binary and install to ~/.local/bin
# for the DEV instance (port 4097, opencode-dev.service).
#
# Sister to cmd/build.sh — kept separate so future merges from upstream do
# not silently retarget our prod 4096 service.
#
# Usage: bash cmd/build-dev.sh
set -euo pipefail

SRC="${OPENCODE_SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
BIN="$HOME/.local/bin/opencode-dev"
UNIT="opencode-dev.service"
PORT_DEFAULT=4097
LOGFILE="${SRC}/.build-dev.log"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

log() { echo "[$(date)] $*"; }

# ── 0. Escape service cgroup ─────────────────────────────────────
# When this script runs as a child of opencode-dev.service, systemd's
# KillMode=control-group will kill us when we restart the service.
# Re-exec ourselves inside a transient scope so we survive the stop.
if [ -z "${OPENCODE_BUILD_SCOPED:-}" ]; then
  CGROUP="$(cat /proc/self/cgroup 2>/dev/null || true)"
  if echo "$CGROUP" | grep -qE "opencode(-dev)?\.service"; then
    log "re-launching in transient scope to escape service cgroup..."
    export OPENCODE_BUILD_SCOPED=1
    exec systemd-run --user --scope \
      --unit="opencode-dev-build" \
      bash "$0" "$@" </dev/null >"$LOGFILE" 2>&1
  fi
fi

cd "$SRC"
log "=== build-dev start (target: $BIN, unit: $UNIT) ==="

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
# Linux returns ETXTBSY if you `cp` over a running binary; `mv` (rename)
# works because the running process keeps its inode.
mkdir -p "$(dirname "$BIN")"
if [ -f "$BIN" ]; then
  mv -f "$BIN" "${BIN}.bak"
  log "moved previous binary to backup"
fi
cp "$BUILT" "$BIN"
chmod +x "$BIN"

VERSION="$("$BIN" --version 2>/dev/null || echo unknown)"
log "installed $BIN ($VERSION)"

# ── 4. Restart service ──────────────────────────────────────────
systemctl --user reset-failed "$UNIT" 2>/dev/null || true
systemctl --user restart "$UNIT"
log "service restarted"

# ── 5. Health check (with rollback) ─────────────────────────────
set -a && source "$SRC/.env" 2>/dev/null && set +a || true
PORT="${PORT:-$PORT_DEFAULT}"
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
