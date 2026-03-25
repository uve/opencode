#!/usr/bin/env bash
# Restart server after update. Called by deploy.sh or cron.
# Usage: bash cmd/restart-on-update.sh
set -euo pipefail
exec bash "$(dirname "$0")/restart.sh"
