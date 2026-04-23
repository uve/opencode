/**
 * Custom UI mount point — single entry into the upstream tree.
 *
 * Add anything new here. Each piece is gated by a feature flag and uses
 * `SlotPortal`/`CssHide` so we never edit upstream files for new features.
 */
import { onMount, Show } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { features } from "./features"
import { CssHide, SlotPortal } from "./slot"
import { SessionTabsStrip } from "./session-tabs-strip"
import { SessionsRegistryProvider } from "./sessions-registry"
import { ClientStateSyncProvider } from "./client-state-sync/client-state-sync"

export function CustomMount() {
  const globalSync = useGlobalSync()
  const layout = useLayout()

  onMount(() => {
    // Debug handles for DevTools / e2e tests:
    //   window.__globalSync.data.project.map(p => p.worktree)
    //   window.__layout.projects.open("/path/to/dir")
    ;(window as any).__globalSync = globalSync
    ;(window as any).__layout = layout
  })

  return (
    <SessionsRegistryProvider>
      <Show when={features.clientStateSync}>
        <ClientStateSyncProvider />
      </Show>

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
