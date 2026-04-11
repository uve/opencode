# Custom Fork Instructions

This is a private fork of `sst/opencode` with custom patches on top of upstream `dev`.
All custom changes live in a single commit on the `main` branch, rebased onto `upstream/dev`.

## CRITICAL: Preserve Custom Patches

This fork has custom code that MUST NOT be removed or overwritten.
After any rebase or merge, run `bash cmd/verify-custom.sh` to check.

### Protected features (do NOT remove):

1. **Voice / Microphone input** — recording button in prompt, transcription via OpenAI Whisper
   - `packages/app/src/components/prompt-input/voice-state.ts`
   - Voice recording logic in `prompt-input.tsx` (`toggleRecording`, `mic` state, `prompt-record` button)
   - `Spinner` and `showToast` imports in `prompt-input.tsx`
   - Voice settings in `packages/app/src/context/settings.tsx` (`voice.enabled`, `voice.model`)
   - i18n keys: `prompt.action.record`, `prompt.action.recording`, `prompt.action.transcribing`
   - Icons: `microphone`, `reload` in `packages/ui/src/components/icon.tsx`

2. **Provider filter** — only `github-copilot` provider with specific models
   - `ALLOWED_MODELS` filter in `packages/opencode/src/provider/provider.ts`

3. **Experimental routes** — transcribe, restart, version endpoints
   - `/experimental/transcribe`, `/experimental/restart`, `/experimental/version`
   - In `packages/opencode/src/server/routes/experimental.ts`

4. **Sessions sidebar** — custom sidebar components
   - `packages/app/src/pages/layout/sessions-sidebar.tsx`
   - `packages/opencode/src/cli/cmd/tui/routes/session/sidebar-sessions.tsx`

5. **Titlebar extras** — version + timestamp display
   - `server.health` and `timestamp()` in `packages/app/src/components/titlebar.tsx`

6. **Sidebar restart button**
   - `onRestart` prop in `packages/app/src/pages/layout/sidebar-shell.tsx`

7. **Server scripts** — `cmd/build.sh`, `cmd/autoupdate.sh`
   - Server binds to `127.0.0.1` (NOT `0.0.0.0`) via `HOST` env var

## Server Access

- URL: `http://127.0.0.1:4096`
- Auth: Basic auth (`opencode` / `515164`)
- Build & deploy: `bash cmd/build.sh`
- Verify patches: `bash cmd/verify-custom.sh`

## Rebase Workflow

1. `git fetch upstream dev`
2. `git rebase upstream/dev` (resolve conflicts keeping our changes)
3. `bash cmd/verify-custom.sh` (must pass)
4. `bash cmd/build.sh`
