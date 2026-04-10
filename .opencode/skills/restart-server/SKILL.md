---
name: restart-server
description: How to restart the OpenCode server managed by systemd
---

# Restarting the OpenCode Server

This server runs as a systemd user service (`opencode.service`). The binary lives at `~/.local/bin/opencode`.

## How to Restart (Rebuild + Restart)

The ONLY correct way to rebuild and restart:

```bash
nohup cmd/build.sh &
```

**Why `nohup`?** The build script stops the running `opencode.service` mid-way through. Since the AI agent runs inside that service, the process will be killed. `nohup` ensures the script survives and completes the restart.

## What `cmd/build.sh` Does

1. Exports `PATH="$HOME/.bun/bin:$PATH"`
2. Runs `bun install`
3. Builds the frontend (`packages/app`)
4. Builds the backend into a single binary
5. Runs `systemctl --user stop opencode.service`
6. Copies binary to `~/.local/bin/opencode`
7. Runs `systemctl --user start opencode.service`
8. Performs a health check (waits for server to respond)

Total time: ~30 seconds.

## The /restart API Endpoint

`POST /experimental/restart` calls `process.exit(0)`. Since systemd has `Restart=always`, it automatically restarts the process. The web UI restart button uses this endpoint. Auth: HTTP Basic (`OPENCODE_SERVER_USERNAME`/`OPENCODE_SERVER_PASSWORD`).

**Note:** This only restarts the current binary — it does NOT rebuild from source. Use `cmd/build.sh` when source code has changed.

## systemd Commands Reference

```bash
# Status
systemctl --user status opencode.service

# Stop
systemctl --user stop opencode.service

# Start
systemctl --user start opencode.service

# Restart (without rebuild)
systemctl --user restart opencode.service

# View logs
journalctl --user -u opencode.service -f
```

## Important Rules

- NEVER kill processes manually (pkill, kill)
- NEVER run the binary directly — let systemd manage it
- When source code changes need to be applied, use `nohup cmd/build.sh &`
- For a simple restart without rebuild, use `systemctl --user restart opencode.service`
