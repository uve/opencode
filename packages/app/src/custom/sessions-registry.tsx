/**
 * Global sessions registry — single source of truth for session tabs.
 *
 * Responsibilities:
 *   1. Subscribe to every project worktree known to the backend (plus the
 *      active URL directory) and keep those subscriptions pinned for the
 *      entire app lifetime so child stores are never evicted.
 *   2. Expose a reactive, sorted list of all non-archived sessions across
 *      every subscribed worktree. Sort order: most-recently-updated first,
 *      with a soft boost for the session the user last visited (so clicking
 *      a tab moves it to the front of the strip).
 *   3. Let the UI slice the top N entries per viewport.
 *
 * Reactivity notes:
 *   - `subscriptions` is a SolidJS store so Solid tracks inserts and can
 *     re-run `allSessions` when new worktrees start streaming sessions.
 *   - `lastVisited` is a signal — bumping it when the user navigates into
 *     a session moves that session toward the front without waiting for
 *     the backend to update `time.updated`.
 */
import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onMount,
  type ParentProps,
  useContext,
} from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useLocation } from "@solidjs/router"
import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"
import { base64Encode } from "@opencode-ai/shared/util/encode"
import { getFilename } from "@opencode-ai/shared/util/path"
import type { Session } from "@opencode-ai/sdk/v2/client"

export type RegistrySession = Session & {
  slug: string
  worktree: string
  projectName: string
}

type ChildStore = ReturnType<ReturnType<typeof useGlobalSync>["child"]>[0]

interface SubscriptionEntry {
  worktree: string
  store: ChildStore
}

function parseDirFromPath(pathname: string): string | undefined {
  // Routes look like /<base64dir>/session/<id> or /<base64dir>/...
  // The first segment after "/" is the base64-encoded directory.
  const seg = pathname.split("/").filter(Boolean)[0]
  if (!seg) return undefined
  try {
    return decode64(seg)
  } catch {
    return undefined
  }
}

function parseSessionIdFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean)
  const idx = parts.indexOf("session")
  if (idx === -1) return undefined
  return parts[idx + 1]
}

function createSessionsRegistry() {
  const globalSync = useGlobalSync()
  const location = useLocation()

  // Reactive store of active subscriptions keyed by worktree.
  // Using a store (not a plain Map) so SolidJS tracks insertions.
  const [subscriptions, setSubscriptions] = createStore<Record<string, SubscriptionEntry>>({})

  // Monotonic counter bumped whenever the user visits a session — used as a
  // soft boost in the sort so the most-recently-opened tab moves to the front
  // of the strip even before the backend updates `time.updated`.
  const [lastVisitTick, setLastVisitTick] = createSignal(0)
  const lastVisited = new Map<string, number>()

  function touchVisit(sessionId: string) {
    const tick = lastVisitTick() + 1
    lastVisited.set(sessionId, tick)
    setLastVisitTick(tick)
  }

  // Reactive set of worktrees we want subscribed. Re-evaluates when the
  // project list changes or when the user navigates into a new directory.
  const worktrees = createMemo(() => {
    const set = new Set<string>()
    for (const project of globalSync.data.project ?? []) {
      if (project.worktree) set.add(project.worktree)
    }
    const activeDir = parseDirFromPath(location.pathname)
    if (activeDir) set.add(activeDir)
    return [...set]
  })

  // Eagerly subscribe. We never unsubscribe — keeping all worktrees pinned
  // for the app lifetime is intentional. Unsubscribing would drop sessions
  // from tabs when the user navigates away.
  createEffect(() => {
    for (const worktree of worktrees()) {
      if (subscriptions[worktree]) continue
      const [store] = globalSync.child(worktree, { bootstrap: true })
      // Wrapping in a stable object so reconcile doesn't churn.
      setSubscriptions(worktree, { worktree, store })
    }
  })

  // Flattened, sorted, deduplicated view across all subscribed stores.
  // This memo depends on:
  //   - Object.keys(subscriptions) — via the store's reactive proxy, Solid
  //     tracks reads and will re-run when new keys are added.
  //   - Each child store's session[] — tracked per read below.
  //   - lastVisitTick() — so click-to-front works without backend input.
  const allSessions = createMemo<RegistrySession[]>(() => {
    // read signal so memo reacts to tab-visit boosts
    lastVisitTick()

    const result: RegistrySession[] = []
    const seen = new Set<string>()

    for (const worktree of Object.keys(subscriptions)) {
      const entry = subscriptions[worktree]
      if (!entry) continue
      const slug = base64Encode(worktree)
      const projectName = getFilename(worktree)
      const sessions = entry.store.session ?? []
      for (const session of sessions) {
        if (session.parentID) continue
        if (session.time?.archived) continue
        if (seen.has(session.id)) continue
        seen.add(session.id)
        result.push({ ...session, slug, worktree, projectName })
      }
    }

    result.sort((a, b) => {
      // Primary: soft "just clicked" boost.
      const va = lastVisited.get(a.id) ?? 0
      const vb = lastVisited.get(b.id) ?? 0
      if (va !== vb) return vb - va
      // Secondary: most-recently-updated first.
      const ta = a.time.updated ?? a.time.created ?? 0
      const tb = b.time.updated ?? b.time.created ?? 0
      return tb - ta
    })

    return result
  })

  // Track route changes so clicking a tab (or navigating anywhere into a
  // session) boosts it to the front of the list without waiting for the
  // backend.
  createEffect(() => {
    const id = parseSessionIdFromPath(location.pathname)
    if (!id) return
    // Only touch if we actually know this session — avoids spurious bumps
    // during loading screens.
    const known = allSessions().some((s) => s.id === id)
    if (known) touchVisit(id)
  })

  function getStore(worktree: string) {
    return subscriptions[worktree]?.store
  }

  function top(limit: number): RegistrySession[] {
    // Always include the currently active session even if it's beyond `limit`
    // so the UI never loses the active tab when the strip is saturated.
    const all = allSessions()
    if (all.length <= limit) return all
    const activeId = parseSessionIdFromPath(location.pathname)
    const head = all.slice(0, limit)
    if (!activeId) return head
    if (head.some((s) => s.id === activeId)) return head
    const active = all.find((s) => s.id === activeId)
    if (!active) return head
    // Replace the oldest entry with the active one, keeping the rest sorted.
    return [...head.slice(0, limit - 1), active]
  }

  return {
    worktrees,
    allSessions,
    top,
    getStore,
    touchVisit,
  }
}

const Context = createContext<ReturnType<typeof createSessionsRegistry>>()

export function SessionsRegistryProvider(props: ParentProps) {
  const value = createSessionsRegistry()
  onMount(() => {
    // Debug handle: window.__sessionsRegistry.top(10)
    ;(window as any).__sessionsRegistry = value
  })
  return <Context.Provider value={value}>{props.children}</Context.Provider>
}

export function useSessionsRegistry() {
  const context = useContext(Context)
  if (!context) throw new Error("useSessionsRegistry must be used within SessionsRegistryProvider")
  return context
}

// Re-exports so consumers don't need to import from solid-js/store.
export { batch, produce, reconcile }
