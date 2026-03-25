#!/usr/bin/env bash
# Build self-contained binary, install to ~/.local/bin, restart server.
# Usage: bash cmd/deploy.sh
set -euo pipefail

SRC="${OPENCODE_SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
BIN="$HOME/.local/bin/opencode"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

log() { echo "[$(date)] $*"; }

cd "$SRC"
log "=== deploy start (src=$SRC) ==="

# ── 1. Install deps ────────────────────────────────────────────────
log "installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# ── 2. Build self-contained binary ───────────────────────────────
log "building binary (--single with embedded web UI)..."
bun run packages/opencode/script/build.ts --single 2>&1 | tail -5

BUILT="$(find packages/opencode/dist -name opencode -type f | head -1)"
if [ -z "$BUILT" ]; then
  log "ERROR: binary not found after build"
  exit 1
fi

# ── 3. Install binary ───────────────────────────────────────────
mkdir -p "$(dirname "$BIN")"
cp "$BUILT" "$BIN"
chmod +x "$BIN"

VERSION="$("$BIN" --version 2>/dev/null || echo unknown)"
log "installed $BIN ($VERSION)"

# ── 4. Stop existing server ──────────────────────────────────────
log "stopping existing server..."
set -a && source "$SRC/.env" 2>/dev/null && set +a || true
PORT="${PORT:-4096}"

OLD_PID="$(lsof -ti :"$PORT" 2>/dev/null || true)"
if [ -n "$OLD_PID" ]; then
  kill "$OLD_PID" 2>/dev/null || true
  sleep 2
  # force kill if still alive
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 1
  log "stopped PID $OLD_PID"
fi

# ── 5. Start server ─────────────────────────────────────────────
log "starting server on port $PORT..."
cd "$SRC"
nohup bash -c 'set -a; source "'"$SRC"'/.env" 2>/dev/null; set +a; exec "'"$BIN"'" serve --port "'"$PORT"'" --hostname 0.0.0.0' \
  > "$SRC/opencode-serve.log" 2>&1 &
SERVER_PID=$!
log "server PID: $SERVER_PID"

# ── 6. Health check ─────────────────────────────────────────────
log "waiting for server..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    log "health check OK (HTTP $HTTP_CODE)"
    break
  fi
  if [ "$i" = "10" ]; then
    log "WARNING: health check failed after 10s (HTTP $HTTP_CODE)"
    log "check logs: tail -f $SRC/opencode-serve.log"
  fi
done

log "=== deploy complete: $VERSION ==="
