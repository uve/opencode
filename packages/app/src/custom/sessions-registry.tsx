/**
 * Global session registry — single source of truth for the tabs strip.
 *
 * Subscribes to every project worktree known to the backend (and the active
 * URL directory) eagerly, keeping their child stores pinned for the lifetime
 * of the app. Real-time updates flow through the existing global-sync WS.
 *
 * Why this exists:
 *   - The session tabs strip needs to show sessions from ALL projects, not
 *     just the one the current route is in.
 *   - `globalSync.child(w, {bootstrap:true})` is lazy — without an owner
 *     keeping it pinned, eviction can drop the store, and re-mounts after
 *     navigation lose the subscription.
 *   - Mounting this provider once at the RouterRoot level guarantees stable
 *     pins and stable reactivity.
 */
import { createContext, createEffect, createMemo, type ParentProps, useContext } from "solid-js"
import { useParams } from "@solidjs/router"
import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"
import { base64Encode } from "@opencode-ai/shared/util/encode"
import { getFilename } from "@opencode-ai/shared/util/path"
import type { Session } from "@opencode-ai/sdk/v2/client"

export type RegistrySession = Session & { slug: string; worktree: string; projectName: string }

type ChildStore = ReturnType<ReturnType<typeof useGlobalSync>["child"]>[0]

function createSessionsRegistry() {
  const globalSync = useGlobalSync()
  const params = useParams()

  // All worktrees we want to track. Reactive on data.project + URL.
  const worktrees = createMemo(() => {
    const set = new Set<string>()
    for (const project of globalSync.data.project ?? []) {
      if (project.worktree) set.add(project.worktree)
    }
    const activeDir = decode64(params.dir)
    if (activeDir) set.add(activeDir)
    return [...set]
  })

  // Eagerly subscribe and pin (pinForOwner is automatic on child()).
  // The map persists across re-runs so already-subscribed stores stay pinned.
  const subscriptions = new Map<string, ChildStore>()

  createEffect(() => {
    for (const worktree of worktrees()) {
      if (subscriptions.has(worktree)) continue
      const [store] = globalSync.child(worktree, { bootstrap: true })
      subscriptions.set(worktree, store)
    }
    // Note: we never unsubscribe — keeping all worktrees pinned for the app
    // lifetime is intentional. If a project disappears from data.project we
    // still want its sessions visible until the user navigates away.
  })

  // All sessions across all subscribed worktrees, sorted by recency.
  const allSessions = createMemo<RegistrySession[]>(() => {
    const result: RegistrySession[] = []
    const seen = new Set<string>()

    // Iterate in insertion order; subscriptions is a Map of all known stores.
    for (const [worktree, store] of subscriptions) {
      const slug = base64Encode(worktree)
      const projectName = getFilename(worktree)
      for (const session of store.session ?? []) {
        if (session.parentID || session.time?.archived) continue
        if (seen.has(session.id)) continue
        seen.add(session.id)
        result.push({ ...session, slug, worktree, projectName })
      }
    }

    result.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    return result
  })

  function getStore(worktree: string) {
    return subscriptions.get(worktree)
  }

  return {
    worktrees,
    allSessions,
    getStore,
  }
}

const Context = createContext<ReturnType<typeof createSessionsRegistry>>()

export function SessionsRegistryProvider(props: ParentProps) {
  const value = createSessionsRegistry()
  return <Context.Provider value={value}>{props.children}</Context.Provider>
}

export function useSessionsRegistry() {
  const context = useContext(Context)
  if (!context) throw new Error("useSessionsRegistry must be used within SessionsRegistryProvider")
  return context
}
