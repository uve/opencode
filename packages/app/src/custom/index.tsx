/**
 * Custom UI mount point — single entry into the upstream tree.
 *
 * Add anything new here. Each piece is gated by a feature flag.
 */
import { onMount, Show } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { features } from "./features"
import { ClientStateSyncProvider } from "./client-state-sync/client-state-sync"

export function CustomMount() {
  const globalSync = useGlobalSync()
  const layout = useLayout()

  onMount(() => {
    ;(window as any).__globalSync = globalSync
    ;(window as any).__layout = layout
  })

  return (
    <>
      <Show when={features.clientStateSync}>
        <ClientStateSyncProvider />
      </Show>
    </>
  )
}
