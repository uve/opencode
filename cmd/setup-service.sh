#!/usr/bin/env bash
# Install the opencode systemd user service.
# Usage: bash cmd/setup-service.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
UNIT="opencode.service"
SRC="$REPO/cmd/$UNIT"
DST="$HOME/.config/systemd/user/$UNIT"

log() { echo "[$(date)] $*"; }

# Enable lingering so user services survive logout
if [ "$(loginctl show-user "$USER" --property=Linger 2>/dev/null | cut -d= -f2)" != "yes" ]; then
  log "enabling lingering for $USER..."
  loginctl enable-linger "$USER"
fi

mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"
log "installed $DST"

systemctl --user daemon-reload
systemctl --user enable "$UNIT"
log "enabled $UNIT"

# Start if not already running
if systemctl --user is-active --quiet "$UNIT"; then
  log "service already running"
else
  systemctl --user start "$UNIT"
  log "started $UNIT"
fi

systemctl --user status "$UNIT" --no-pager || true
log "done"
