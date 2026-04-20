This is a private fork of sst/opencode. All changes live in ONE commit on `main`, rebased onto `upstream/dev`.

## Remotes

- `origin` = `git@github.com:uve/opencode.git` (private fork)
- `upstream` = `git@github.com:sst/opencode.git` (original repo)

## Update Workflow

To update the fork, use the `/update` command or say "обнови себя". This loads the `update-fork` skill which contains:

- Complete manifest of every custom change (32 files, 16 categories)
- Step-by-step workflow (save patch → fetch → reset → apply → verify → deploy)
- Conflict resolution strategy
- Verification checklist

See: `.opencode/skills/update-fork/SKILL.md`

## Protected Custom Patches (DO NOT REMOVE)

1. **Voice/Microphone** — `voice-state.ts`, `realtime.ts`, recording UI in `prompt-input.tsx`, voice settings, icons (microphone, reload, headphones), sound utilities (iOS unlock)
2. **Provider filter** — `ALLOWED_MODELS` in `provider.ts`, only `github-copilot` with 4 models
3. **Experimental routes** — `/transcribe` (Whisper proxy), `/restart` (process exit), `/version` (git timestamp)
4. **Sessions sidebar (web)** — `sessions-sidebar.tsx`, layout state, resize, mobile overlay, keybind `mod+shift+b`
5. **Sessions sidebar (TUI)** — `sidebar-sessions.tsx`, toggle, overlay on narrow terminals
6. **Titlebar** — version + timestamp display, sessions sidebar toggle button
7. **Sidebar restart button** — `onRestart` in `sidebar-shell.tsx`, red reload icon
8. **Sidebar navigation fix** — `onNavigate` in `sidebar-items.tsx`, `mobileSidebar.hide()`
9. **Right sidebar icons** — `sidebar-right`, `sidebar-right-active` in `icon.tsx`
10. **Permission auto-accept** — always enable directory auto-accept in `permission.tsx`
11. **Question dock fix** — improved measure() in `session-question-dock.tsx`, `80dvh` in CSS
12. **Session header imports** — `createResource`, `on` in `session-header.tsx`
13. **Static file serving** — `OPENCODE_APP_DIR` + `serveStatic` in `instance.ts`
14. **Bootstrap API key check** — `OPENAI_API_KEY` required in `bootstrap.ts`
15. **Models snapshot** — `models-snapshot.{ts,js,d.ts}`
16. **Server scripts** — `cmd/` directory (autoupdate, deploy, start, restart, verify, service, setup)

## Server

- URL: `http://127.0.0.1:4096`
- Auth: `opencode` / `515164`
- Service: `systemctl --user {start,stop,restart} opencode.service`
- Logs: `journalctl --user -u opencode.service -f`

## After Rebase

```bash
bash cmd/verify-custom.sh
```

## Deploy

```bash
bash cmd/deploy.sh
```
