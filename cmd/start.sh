#!/usr/bin/env bash
# Start opencode server from pre-built binary.
# Usage: bash cmd/start.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HOME/.local/bin/opencode"

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$REPO"
set -a && source "$REPO/.env" 2>/dev/null && set +a || true
PORT="${PORT:-4096}"

echo "[$(date)] starting opencode on port $PORT..."
exec "$BIN" serve --port "$PORT" --hostname 0.0.0.0
