#!/usr/bin/env bash
# Stop the running opencode server and restart it.
# Usage: bash cmd/restart.sh
set -euo pipefail

cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
PORT="${PORT:-4096}"

log() { echo "[$(date)] $*"; }

PID="$(lsof -ti :"$PORT" 2>/dev/null || true)"
if [ -n "$PID" ]; then
  log "stopping PID $PID on port $PORT..."
  kill "$PID" 2>/dev/null || true
  sleep 2
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
fi

log "starting server..."
nohup bash "$(pwd)/cmd/start.sh" > "$(pwd)/opencode-serve.log" 2>&1 &
log "started (PID $!), logs: opencode-serve.log"
