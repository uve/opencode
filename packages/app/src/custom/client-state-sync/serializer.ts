/**
 * Serializer/applier for synced UI state (custom fork).
 *
 * Bridges the persisted Solid stores (`useServer().store` and
 * `useLayout().store`) with the opaque JSON blob the backend stores.
 *
 * Whitelist approach: ONLY fields explicitly listed here are synced.
 * Scroll positions, panel widths, voice state, mobile sidebar etc. are
 * intentionally NOT synced (they are device-local UX preferences).
 *
 * Schema is versioned so future incompatible changes can be ignored
 * gracefully on older tabs.
 */
import type { SetStoreFunction } from "solid-js/store"

export const SCHEMA_VERSION = 1

type StoredProject = { worktree: string; expanded: boolean }
type SessionTabs = { active?: string; all: string[] }

export type Snapshot = {
  v: number
  /** Per-origin: list of opened projects with expansion state. */
  projects: Record<string, StoredProject[]>
  /** Per-origin: last active project worktree. */
  lastProject: Record<string, string>
  /** Per-session-key: open table tabs + active tab. */
  sessionTabs: Record<string, SessionTabs>
}

type ServerStore = {
  projects: Record<string, StoredProject[]>
  lastProject: Record<string, string>
}
type LayoutStore = {
  sessionTabs: Record<string, SessionTabs>
}

export function collect(server: ServerStore, layout: LayoutStore): Snapshot {
  return {
    v: SCHEMA_VERSION,
    projects: structuredClone(server.projects),
    lastProject: structuredClone(server.lastProject),
    sessionTabs: structuredClone(layout.sessionTabs),
  }
}

export function serialize(snapshot: Snapshot): string {
  return JSON.stringify(snapshot)
}

export function deserialize(raw: string): Snapshot | undefined {
  if (!raw) return
  const parsed = safeParse(raw)
  if (!parsed) return
  if (parsed.v !== SCHEMA_VERSION) return
  return parsed
}

function safeParse(raw: string): Snapshot | undefined {
  try {
    return JSON.parse(raw) as Snapshot
  } catch {
    return
  }
}

/**
 * Apply a remote snapshot to the local stores.
 *
 * Strategy: replace whole maps (LWW). This is safe because:
 *  - per-origin projects: full list from latest writer wins
 *  - per-session sessionTabs: full set wins, accidentally-closed tabs from
 *    other devices remain closed (acceptable trade-off for v1)
 *
 * Returns true if anything actually changed (so callers can skip echo PUTs).
 */
export function apply(
  snapshot: Snapshot,
  setServer: SetStoreFunction<ServerStore>,
  setLayout: SetStoreFunction<LayoutStore>,
): boolean {
  let changed = false
  setServer((prev) => {
    if (jsonEquals(prev.projects, snapshot.projects) && jsonEquals(prev.lastProject, snapshot.lastProject)) return prev
    changed = true
    return { ...prev, projects: snapshot.projects, lastProject: snapshot.lastProject }
  })
  setLayout((prev) => {
    if (jsonEquals(prev.sessionTabs, snapshot.sessionTabs)) return prev
    changed = true
    return { ...prev, sessionTabs: snapshot.sessionTabs }
  })
  return changed
}

export function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}
