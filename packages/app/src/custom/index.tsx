/**
 * Custom UI mount point — single entry into the upstream tree.
 *
 * Add anything new here. Each piece is gated by a feature flag and uses
 * `SlotPortal`/`CssHide` so we never edit upstream files for new features.
 */
import { onMount, Show } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { features } from "./features"
import { CssHide, SlotPortal } from "./slot"
import { SessionTabsStrip } from "./session-tabs-strip"
import { SessionsRegistryProvider, useSessionsRegistry } from "./sessions-registry"

export function CustomMount() {
  const globalSync = useGlobalSync()

  onMount(() => {
    // Debug handle so we can inspect from DevTools console:
    //   window.__globalSync.data.project.map(p => p.worktree)
    ;(window as any).__globalSync = globalSync
  })

  return (
    <SessionsRegistryProvider>
      <DebugRegistry />
      <Show when={features.sessionTabs}>
        <SlotPortal selector="#opencode-titlebar-center">
          <SessionTabsStrip />
        </SlotPortal>
      </Show>

      <Show when={features.hideCentralSearch}>
        <CssHide selector='[data-component="header-search"]' />
      </Show>

      <Show when={features.hideSessionProgressBar}>
        <CssHide selector='[data-component="session-progress"]' />
      </Show>

      <Show when={features.hideOpenOrCopyPath}>
        <CssHide selector='[data-component="header-open-or-copy"]' />
      </Show>
    </SessionsRegistryProvider>
  )
}

function DebugRegistry() {
  const registry = useSessionsRegistry()
  onMount(() => {
    // Debug handle:
    //   window.__sessionsRegistry.allSessions().map(s => ({title: s.title, project: s.projectName}))
    ;(window as any).__sessionsRegistry = registry
  })
  return null
}
