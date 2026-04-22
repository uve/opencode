/**
 * Session tabs registry.
 *
 * Architecture: this is a thin reactive view over the SAME data the sidebar
 * (`pages/layout/sessions-sidebar.tsx`) renders. We deliberately do not run
 * any of our own fetching, WebSocket subscriptions, or per-session indexing.
 * Everything the tabs need (session list, statuses, live updates, multi-window
 * sync) is already maintained by `global-sync` and exposed via
 * `globalSync.child(worktree, {bootstrap:true})`.
 *
 * Sort order: `time.updated ?? time.created` desc — identical to the sidebar.
 *
 * The only piece of UX we add on top is a soft "click boost": when the user
 * navigates into a tab we move it to the front of the strip immediately,
 * without waiting for the backend to bump `time.updated`. This is purely
 * client-side and does not modify any shared state.
 */
import {
  createContext,
  createMemo,
  createSignal,
  onMount,
  type ParentProps,
  useContext,
} from "solid-js"
import { useLocation } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { base64Encode } from "@opencode-ai/shared/util/encode"
import { getFilename } from "@opencode-ai/shared/util/path"
import type { Session } from "@opencode-ai/sdk/v2/client"

export type RegistrySession = Session & {
  slug: string
  worktree: string
  projectName: string
}

function parseSessionIdFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean)
  const i = parts.indexOf("session")
  if (i === -1) return undefined
  return parts[i + 1]
}

function createSessionsRegistry() {
  const layout = useLayout()
  const globalSync = useGlobalSync()
  const location = useLocation()

  // Soft boost — clicking a tab pulls it to the front of the strip immediately.
  // Stored outside SolidJS reactivity (plain Map); we use a tick signal to
  // invalidate the sort memo when it changes.
  const softBoost = new Map<string, number>()
  const [softTick, setSoftTick] = createSignal(0)

  function touchVisit(sessionId: string) {
    softBoost.set(sessionId, Date.now())
    setSoftTick(softTick() + 1)
  }

  // Mirror of the sidebar's session pipeline.
  const allSessions = createMemo<RegistrySession[]>(() => {
    softTick() // subscribe so click-boost re-sorts
    const result: RegistrySession[] = []
    const seen = new Set<string>()
    for (const project of layout.projects.list()) {
      const [store] = globalSync.child(project.worktree, { bootstrap: true })
      const slug = base64Encode(project.worktree)
      const name = project.name || getFilename(project.worktree)
      for (const session of store.session ?? []) {
        if (session.parentID || session.time?.archived) continue
        if (seen.has(session.id)) continue
        seen.add(session.id)
        result.push({ ...session, slug, worktree: project.worktree, projectName: name })
      }
    }
    result.sort((a, b) => {
      const ka = softBoost.get(a.id) ?? a.time.updated ?? a.time.created ?? 0
      const kb = softBoost.get(b.id) ?? b.time.updated ?? b.time.created ?? 0
      return kb - ka
    })
    return result
  })

  function top(limit: number): RegistrySession[] {
    const all = allSessions()
    if (all.length <= limit) return all
    const activeId = parseSessionIdFromPath(location.pathname)
    const head = all.slice(0, limit)
    if (!activeId || head.some((s) => s.id === activeId)) return head
    const active = all.find((s) => s.id === activeId)
    if (!active) return head
    // Replace last slot with the active session so it's never invisible.
    return [...head.slice(0, limit - 1), active]
  }

  function getStore(worktree: string) {
    const [store] = globalSync.child(worktree, { bootstrap: true })
    return store
  }

  function debugDump() {
    return allSessions().map((s) => ({
      id: s.id,
      title: s.title,
      worktree: s.worktree,
      updated: s.time.updated,
      iso: s.time.updated ? new Date(s.time.updated).toISOString() : undefined,
      boosted: softBoost.has(s.id),
    }))
  }

  return {
    allSessions,
    top,
    getStore,
    touchVisit,
    debugDump,
  }
}

const Context = createContext<ReturnType<typeof createSessionsRegistry>>()

export function SessionsRegistryProvider(props: ParentProps) {
  const value = createSessionsRegistry()
  onMount(() => {
    // Debug handle: window.__sessionsRegistry.debugDump()
    ;(window as unknown as { __sessionsRegistry: unknown }).__sessionsRegistry = value
  })
  return <Context.Provider value={value}>{props.children}</Context.Provider>
}

export function useSessionsRegistry() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useSessionsRegistry must be used within SessionsRegistryProvider")
  return ctx
}
