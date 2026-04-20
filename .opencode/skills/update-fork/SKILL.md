# Update Fork — Rebase Custom Patches onto Upstream

This skill handles updating the private fork of `sst/opencode` by rebasing the single custom commit onto the latest `upstream/dev`, resolving all conflicts, and verifying no changes are lost.

## Architecture

- **origin** = `git@github.com:uve/opencode.git` (private fork)
- **upstream** = `git@github.com:sst/opencode.git` (original repo)
- Branch `main` = `upstream/dev` + ONE custom commit on top
- The custom commit message: `feat: copilot-remote — remote serve, voice input, settings, health & deploy`

## Complete Manifest of Custom Changes

Every item below MUST survive the rebase. If any is missing after rebase, re-apply it.

### 1. Voice / Microphone Input

| What                  | File                                                      | Details                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Voice state module    | `packages/app/src/components/prompt-input/voice-state.ts` | **NEW FILE** — `voice()` signal, `toggleRecording()`, state machine (idle/recording/transcribing)                                                                                                                              |
| Realtime audio module | `packages/app/src/components/prompt-input/realtime.ts`    | **NEW FILE** — `createRealtime()` for live audio streaming                                                                                                                                                                     |
| Prompt input changes  | `packages/app/src/components/prompt-input.tsx`            | Enter on empty input triggers `toggleRecording()`, voice status checks (`recording`/`transcribing`), `Spinner` import, `showToast` import, `prompt-record` button, `prompt-realtime` button, `gap-3` spacing in action buttons |
| Voice settings        | `packages/app/src/context/settings.tsx`                   | `voice` field in settings interface                                                                                                                                                                                            |
| i18n keys             | `packages/app/src/i18n/en.ts`                             | `prompt.action.record` translation key                                                                                                                                                                                         |
| Sound utilities       | `packages/app/src/utils/sound.ts`                         | iOS Safari audio unlock (`shared` Audio element, `unlock()` on first interaction), reuse unlocked element in `playSound()`                                                                                                     |
| Icons                 | `packages/ui/src/components/icon.tsx`                     | `microphone`, `reload`, `headphones` icon SVG paths                                                                                                                                                                            |

### 2. Provider Filter (github-copilot only)

| What         | File                                         | Details                                                                                                                                                                           |
| ------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model filter | `packages/opencode/src/provider/provider.ts` | `ALLOWED_MODELS` set (`claude-opus-4.6`, `claude-opus-4.6-1m`, `gpt-5.4`, `gemini-3.1-pro-preview`), delete all providers except `github-copilot`, delete models not in allowlist |

### 3. Experimental API Routes

| What                | File                                                  | Details                                                                                   |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Transcribe endpoint | `packages/opencode/src/server/routes/experimental.ts` | `POST /transcribe` — proxy to OpenAI Whisper/gpt-4o-transcribe, requires `OPENAI_API_KEY` |
| Restart endpoint    | `packages/opencode/src/server/routes/experimental.ts` | `POST /restart` — `process.exit(0)` after 100ms for service restart                       |
| Version endpoint    | `packages/opencode/src/server/routes/experimental.ts` | `GET /version` — returns git timestamp of second-to-last commit                           |

### 4. Sessions Sidebar (Web App)

| What              | File                                                     | Details                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar component | `packages/app/src/pages/layout/sessions-sidebar.tsx`     | **NEW FILE** — `SessionsSidebar` component showing all sessions across projects, grouped by project, sorted by update time, with archive action                                                              |
| Sidebar tests     | `packages/app/src/pages/layout/sessions-sidebar.test.ts` | **NEW FILE** — unit tests                                                                                                                                                                                    |
| Layout state      | `packages/app/src/context/layout.tsx`                    | `sessionsSidebar` store field (`opened`, `width: 260`), `open/close/toggle/resize` methods, `DEFAULT_PANEL_WIDTH = 344`, `DEFAULT_SIDEBAR_WIDTH = 480`, sidebar width migration (clamp small widths)         |
| Layout rendering  | `packages/app/src/pages/layout.tsx`                      | `SessionsSidebar` import, `sessionsSidebar.toggle` command (`mod+shift+b`), right sidebar panel with `ResizeHandle`, mobile overlay, `--main-right` CSS variable, `xl:border-r xl:rounded-tr-[12px]` on main |
| Config keybind    | `packages/opencode/src/config/config.ts`                 | `sessions_sidebar_toggle` keybind (`<leader>p`)                                                                                                                                                              |

### 5. Sessions Sidebar (TUI)

| What            | File                                                                    | Details                                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI sidebar     | `packages/opencode/src/cli/cmd/tui/routes/session/sidebar-sessions.tsx` | **NEW FILE** — `SessionsSidebar` component for terminal UI, 38 cols wide, session list with status indicators                                                                                                                          |
| TUI integration | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`            | Import `SessionsSidebar` (replacing `SubagentFooter`), `sessionsSidebar`/`sessionsSidebarOpen` signals, `sessionsSidebarVisible` memo, width calculation, toggle command, rendering with overlay on narrow terminals, `paddingTop={1}` |

### 6. Titlebar Enhancements

| What                | File                                       | Details                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version + timestamp | `packages/app/src/components/titlebar.tsx` | `createResource` import, `auth` memo for API auth headers, `timestamp` resource fetching `/experimental/version`, visibility change refetch, version display (`server.health?.version`), timestamp display, sessions sidebar toggle button with `sidebar-right`/`sidebar-right-active` icons |

### 7. Sidebar Extras

| What           | File                                              | Details                                                                                                    |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Restart button | `packages/app/src/pages/layout/sidebar-shell.tsx` | `onRestart` prop, red reload `IconButton` (color `#ef4444`)                                                |
| Navigation fix | `packages/app/src/pages/layout/sidebar-items.tsx` | `onNavigate` prop on `SessionRow`, calls `layout.mobileSidebar.hide()` on click, same for `NewSessionItem` |

### 8. Icons

| What                | File                                  | Details                                              |
| ------------------- | ------------------------------------- | ---------------------------------------------------- |
| Right sidebar icons | `packages/ui/src/components/icon.tsx` | `sidebar-right` and `sidebar-right-active` SVG paths |

### 9. Permission Auto-accept

| What                | File                                      | Details                                                                                                                                    |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Default auto-accept | `packages/app/src/context/permission.tsx` | Remove conditional on `config.permission === "allow"`, always auto-enable directory-level auto-accept when `autoAccept[key] === undefined` |

### 10. Question Dock Fix

| What           | File                                                                | Details                                                                                                                               |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Measure fix    | `packages/app/src/pages/session/composer/session-question-dock.tsx` | Improved `measure()`: fallback to `scroller.getBoundingClientRect().top`, use `window.innerHeight` to clamp `dockBottom`/`rootBottom` |
| Max height CSS | `packages/ui/src/components/message-part.css`                       | `--question-prompt-max-height` default `80dvh` (was `100dvh`)                                                                         |

### 11. Session Header Import Fix

| What          | File                                                     | Details                                          |
| ------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Extra imports | `packages/app/src/components/session/session-header.tsx` | Added `createResource`, `on` to solid-js imports |

### 12. Server Static File Serving

| What         | File                                       | Details                                                                                                         |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Static serve | `packages/opencode/src/server/instance.ts` | `serveStatic` import from `hono/bun`, `OPENCODE_APP_DIR` env check, serve static files with index.html fallback |

### 13. Bootstrap OPENAI_API_KEY Check

| What          | File                                         | Details                                                      |
| ------------- | -------------------------------------------- | ------------------------------------------------------------ |
| API key check | `packages/opencode/src/project/bootstrap.ts` | Throw `Error` if `OPENAI_API_KEY` not set before plugin init |

### 14. Models Snapshot Files

| What             | File                                                  | Details      |
| ---------------- | ----------------------------------------------------- | ------------ |
| Type definitions | `packages/opencode/src/provider/models-snapshot.d.ts` | **NEW FILE** |
| JS module        | `packages/opencode/src/provider/models-snapshot.js`   | **NEW FILE** |
| TS module        | `packages/opencode/src/provider/models-snapshot.ts`   | **NEW FILE** |

### 15. Server/Deploy Scripts

| What              | File                       | Details                                               |
| ----------------- | -------------------------- | ----------------------------------------------------- |
| Auto-update       | `cmd/autoupdate.sh`        | **NEW FILE** — fetch upstream, patch-apply, deploy    |
| Deploy            | `cmd/deploy.sh`            | **NEW FILE** — build binary, install, restart systemd |
| Start             | `cmd/start.sh`             | **NEW FILE** — start systemd service                  |
| Restart           | `cmd/restart.sh`           | **NEW FILE** — restart systemd service                |
| Restart on update | `cmd/restart-on-update.sh` | **NEW FILE** — wrapper calling restart.sh             |
| Verify patches    | `cmd/verify-custom.sh`     | **NEW FILE** — verify custom patches survived rebase  |
| Systemd unit      | `cmd/opencode.service`     | **NEW FILE** — systemd user service definition        |
| Setup service     | `cmd/setup-service.sh`     | **NEW FILE** — install systemd unit, enable lingering |

### 16. OpenCode Config

| What              | File                                       | Details                                            |
| ----------------- | ------------------------------------------ | -------------------------------------------------- |
| Restart command   | `.opencode/command/restart.md`             | **NEW FILE** — slash command for restarting server |
| Restart skill     | `.opencode/skills/restart-server/SKILL.md` | **NEW FILE** — skill for restarting server         |
| Custom fork agent | `.opencode/agent/custom-fork.md`           | **NEW FILE** — agent description for this fork     |
| Update fork skill | `.opencode/skills/update-fork/SKILL.md`    | **THIS FILE**                                      |
| Update command    | `.opencode/command/update.md`              | Slash command to trigger this skill                |

---

## Workflow

When the user says "update yourself", "обнови себя", "обнови opencode", or runs `/update`:

### Step 1: Pre-flight

```bash
# Ensure clean working tree
git status --porcelain
# If dirty, amend into the top commit
git add -A && git commit --amend --no-edit
```

### Step 2: Save Current Patch

```bash
# Save the full diff of the custom commit
git diff HEAD~1 HEAD > /tmp/opencode-fork-patch.diff
# Also save the list of new files
git diff HEAD~1 HEAD --diff-filter=A --name-only > /tmp/opencode-fork-new-files.txt
# Record the commit message
git log -1 --format='%s' > /tmp/opencode-fork-message.txt
```

### Step 3: Fetch Upstream

```bash
git fetch upstream dev
```

Check what changed:

```bash
# Show new upstream commits since our base
git log HEAD~1..upstream/dev --oneline
```

If upstream/dev is the same as HEAD~1, nothing to do — skip to Deploy.

### Step 4: Reset to Upstream

```bash
# Move main to upstream/dev
git reset --hard upstream/dev
```

### Step 5: Apply Custom Patch

```bash
# Try clean apply first
git apply --3way /tmp/opencode-fork-patch.diff
```

If this succeeds cleanly, go to Step 7.

If it fails, apply with reject files:

```bash
git apply --reject --whitespace=fix /tmp/opencode-fork-patch.diff 2>&1 || true
```

Then **manually resolve each .rej file**:

- Read the `.rej` file to understand what hunk failed
- Read the target file to understand the current upstream state
- Apply the change manually, adapting to upstream changes
- Use the manifest above to understand the INTENT of each change
- Delete the `.rej` file after resolving

### Step 6: Handle New Files

Check that all NEW files from the manifest exist:

```bash
cat /tmp/opencode-fork-new-files.txt
```

If any are missing (because `git apply` skipped them), recreate them from the saved patch.

### Step 7: Install Dependencies & Resolve Lockfile

```bash
bun install
```

This regenerates `bun.lock` for the current upstream dependencies + our changes.

### Step 8: Verify ALL Custom Patches

Run the verification script:

```bash
bash cmd/verify-custom.sh
```

If any check fails, fix it by re-applying the change from the manifest.

Additionally, manually verify these critical patterns:

| Check                     | File                                                                    | Pattern                                                         |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Voice state module exists | `packages/app/src/components/prompt-input/voice-state.ts`               | file exists                                                     |
| Realtime module exists    | `packages/app/src/components/prompt-input/realtime.ts`                  | file exists                                                     |
| Sound utilities exist     | `packages/app/src/utils/sound.ts`                                       | `unlock` function present                                       |
| Sessions sidebar exists   | `packages/app/src/pages/layout/sessions-sidebar.tsx`                    | file exists                                                     |
| TUI sidebar exists        | `packages/opencode/src/cli/cmd/tui/routes/session/sidebar-sessions.tsx` | file exists                                                     |
| Provider filter active    | `packages/opencode/src/provider/provider.ts`                            | `ALLOWED_MODELS` and `github-copilot`                           |
| Transcribe route          | `packages/opencode/src/server/routes/experimental.ts`                   | `transcribe`                                                    |
| Restart route             | `packages/opencode/src/server/routes/experimental.ts`                   | `experimental.restart`                                          |
| Version route             | `packages/opencode/src/server/routes/experimental.ts`                   | `experimental.version`                                          |
| Static serve              | `packages/opencode/src/server/instance.ts`                              | `OPENCODE_APP_DIR`                                              |
| Bootstrap check           | `packages/opencode/src/project/bootstrap.ts`                            | `OPENAI_API_KEY`                                                |
| Sessions sidebar state    | `packages/app/src/context/layout.tsx`                                   | `sessionsSidebar`                                               |
| Titlebar version          | `packages/app/src/components/titlebar.tsx`                              | `server.health`                                                 |
| Titlebar timestamp        | `packages/app/src/components/titlebar.tsx`                              | `timestamp()`                                                   |
| Restart button            | `packages/app/src/pages/layout/sidebar-shell.tsx`                       | `onRestart`                                                     |
| Permission auto-accept    | `packages/app/src/context/permission.tsx`                               | `autoAccept[key] === undefined` without config.permission check |
| Question dock fix         | `packages/ui/src/components/message-part.css`                           | `80dvh`                                                         |
| Right sidebar icons       | `packages/ui/src/components/icon.tsx`                                   | `sidebar-right`                                                 |
| Config keybind            | `packages/opencode/src/config/config.ts`                                | `sessions_sidebar_toggle`                                       |
| TUI sidebar import        | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`            | `SessionsSidebar` from `./sidebar-sessions`                     |
| Models snapshot           | `packages/opencode/src/provider/models-snapshot.ts`                     | file exists                                                     |
| Enter-to-record           | `packages/app/src/components/prompt-input.tsx`                          | `toggleRecording`                                               |
| Navigation fix            | `packages/app/src/pages/layout/sidebar-items.tsx`                       | `onNavigate`                                                    |

### Step 9: Commit as Single Commit

```bash
git add -A
git commit -m "feat: copilot-remote — remote serve, voice input, settings, health & deploy"
```

### Step 10: Push

```bash
git push origin main --force-with-lease
```

### Step 11: Deploy

```bash
bash cmd/deploy.sh
```

---

## Conflict Resolution Strategy

When applying the patch fails on a specific file, follow these rules:

1. **New files** (voice-state.ts, realtime.ts, sessions-sidebar.tsx, etc.) — these should NEVER conflict. If missing, copy them from the saved patch verbatim.

2. **Appended code** (experimental routes, provider filter) — upstream may have added new code above/below the insertion point. Find the correct new insertion point and apply the custom code there.

3. **Modified lines** (prompt-input.tsx, titlebar.tsx, layout.tsx) — upstream may have refactored these files. Read the upstream version, understand its structure, and re-apply the custom logic adapting to the new code structure. The INTENT from the manifest is more important than the exact diff.

4. **Import changes** (session-header.tsx) — if upstream already added the imports we need, skip. If upstream restructured imports, adapt.

5. **CSS changes** (message-part.css) — find the same selector and apply the value change.

6. **Config changes** (config.ts) — find the keybindings section and add the new keybind.

7. **Lockfiles** (bun.lock) — ALWAYS regenerate with `bun install`, never try to merge.

## Emergency Recovery

If the rebase goes badly wrong:

```bash
# The old commit hash is in the reflog
git reflog
# Find the old HEAD and reset
git reset --hard <old-hash>
```

## Cron Automation

The daily autoupdate is run by cron or systemd timer. The script `cmd/autoupdate.sh` performs the mechanical steps. When it encounters conflicts it cannot resolve, it aborts the rebase and logs the error. The user can then run `/update` to have the agent resolve conflicts intelligently.
