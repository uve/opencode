---
description: Update OpenCode — rebase custom patches onto latest upstream/dev
skill: update-fork
---

You are updating the private fork of sst/opencode. Load the `update-fork` skill and follow its workflow exactly.

## Quick Summary

1. Save the current custom patch (`git diff HEAD~1 HEAD`)
2. Fetch `upstream/dev`
3. Reset `main` to `upstream/dev`
4. Apply the saved patch with `git apply --3way`
5. If conflicts — resolve them using the manifest from the skill (read each `.rej` file, understand the intent, apply manually)
6. Run `bun install` to regenerate lockfile
7. Run `bash cmd/verify-custom.sh` — if anything fails, fix it
8. Manually verify ALL items from the manifest checklist
9. Commit as single commit: `feat: copilot-remote — remote serve, voice input, settings, health & deploy`
10. Force push: `git push origin main --force-with-lease`
11. Deploy: `bash cmd/deploy.sh`

## CRITICAL RULES

- The custom commit MUST always be exactly ONE commit on top of upstream/dev
- NEVER lose any custom change from the manifest — verify every single one
- When resolving conflicts, the INTENT from the manifest is more important than the exact diff lines
- Lockfiles (`bun.lock`) are ALWAYS regenerated, never merged
- New files from the manifest must ALWAYS exist after the update
- If `verify-custom.sh` fails, DO NOT proceed to deploy — fix first
