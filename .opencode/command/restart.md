---
description: Restart the OpenCode server via launchd
---

Restart the server by running this command in the terminal:

```
launchctl kickstart -k "gui/$(id -u)/com.opencode.server"
```

This will cause launchd to kill the current server process and start a fresh one (build + serve).
The server should be back up within ~15 seconds.

## Other useful launchd commands

```bash
# Stop the server (no auto-restart)
launchctl bootout gui/$(id -u)/com.opencode.server

# Load the server service (after bootout or first install)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.opencode.server.plist

# Check status
launchctl print gui/$(id -u)/com.opencode.server
```

## Important

- Do NOT use deprecated `launchctl load/unload` — use `bootstrap/bootout` instead.
- Do NOT run start.sh directly — let launchd manage it.
- Do NOT kill processes manually (kill, pkill).
