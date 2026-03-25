---
name: restart-server
description: How to restart the OpenCode server managed by launchd
---

# Restarting the OpenCode Server

This server runs as a launchd service (`com.opencode.server`). launchd keeps it alive automatically via `KeepAlive=true`.

## How to Restart

The ONLY correct way to restart the server:

```bash
launchctl kickstart -k "gui/$(id -u)/com.opencode.server"
```

This tells launchd to kill the current process and immediately start a new one. The start script (`cmd/start.sh`) will rebuild and serve.

## What Happens on Restart

1. launchd sends SIGTERM to the bun serve process
2. launchd starts `cmd/start.sh` fresh
3. `start.sh` runs `bun install`, builds backend and frontend, then `exec bun serve`
4. Server is back up in ~15 seconds

## The /restart API Endpoint

`POST /experimental/restart` calls `process.exit(0)` with a 100ms delay. Since launchd has `KeepAlive=true`, it automatically restarts the process. The web UI restart button uses this endpoint. Auth: HTTP Basic (`OPENCODE_SERVER_USERNAME`/`OPENCODE_SERVER_PASSWORD`).

## Related Services

| Service | Label | What it does |
|---------|-------|-------------|
| Server | `com.opencode.server` | bun serve on port 4096 |
| Tunnel | `com.opencode.tunnel` | cloudflared tunnel `copilot-remote` |
| Autoupdate | `com.opencode.autoupdate` | daily git rebase + restart at 01:00 |

Plist files: `~/Library/LaunchAgents/com.opencode.*.plist`

## launchd Commands Reference

```bash
# Restart (kill + relaunch)
launchctl kickstart -k "gui/$(id -u)/com.opencode.server"

# Stop service (no auto-restart)
launchctl bootout "gui/$(id -u)/com.opencode.server"

# Load service (after bootout or first install)
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.opencode.server.plist

# Status
launchctl print "gui/$(id -u)/com.opencode.server"
```

**NOTE**: `launchctl load/unload` are deprecated and will fail with "Input/output error" if the service is already loaded. Always use `bootstrap`/`bootout` instead.

## Important Rules

- NEVER kill processes manually (pkill, kill)
- NEVER run `cmd/start.sh` directly — let launchd manage it
- NEVER use `launchctl load/unload` — use `bootstrap/bootout`

## Checking Logs

```bash
# Server logs
tail -f /Users/1com/workspace/opencode/tmp/server.log

# Tunnel logs
tail -f /Users/1com/workspace/opencode/tmp/tunnel.log
```
