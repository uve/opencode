/**
 * Cross-device client UI state sync (custom fork).
 *
 * Orchestration layer: wires together the persisted Solid stores and the
 * backend `/custom/client-state` endpoint + Bus event.
 *
 * Lifecycle:
 *  1. onMount: GET initial state. If newer than local empty state, apply.
 *  2. createEffect on (server.store, layout.store): debounced PUT.
 *  3. globalSDK.event.listen: on `custom.client_state.updated` from a
 *     different device_id, deserialize + apply.
 *
 * Echo suppression:
 *  - Every PUT carries our deviceId.
 *  - Incoming events with our own deviceId are ignored.
 *  - When applying remote state we mark `applying = true` so the resulting
 *    store mutations don't immediately re-trigger our PUT effect.
 *
 * Conflict policy: optimistic concurrency via if_match (last seen
 * time_updated). On 409, refetch and apply (last writer wins).
 */
import { createEffect, on, onCleanup, onMount } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import type { Event } from "@opencode-ai/sdk/v2/client"
import { deviceId } from "./device-id"
import { apply, collect, deserialize, serialize, type Snapshot } from "./serializer"

const DEBOUNCE_MS = 400
const EVENT_TYPE = "custom.client_state.updated"

type RemoteEventProps = { state: string; device_id: string; time_updated: number }

export function ClientStateSyncProvider() {
  const server = useServer()
  const layout = useLayout()
  const globalSDK = useGlobalSDK()

  const me = deviceId()
  let applying = false
  let lastSeenAt = 0
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let inflight: Promise<void> | undefined

  const serverCustom = (server as any).__custom as
    | {
        store: { projects: Record<string, any[]>; lastProject: Record<string, string> }
        replaceProjects: (key: string, projects: any[]) => void
        replaceLastProject: (key: string, dir: string | undefined) => void
      }
    | undefined
  const layoutCustom = (layout as any).__custom as
    | { store: { sessionTabs: Record<string, any> }; replaceSessionTabs: (next: Record<string, any>) => void }
    | undefined

  if (!serverCustom || !layoutCustom) {
    console.warn("[client-state-sync] missing __custom escape hatch on server/layout context")
    return null
  }

  const sdk = () => globalSDK.createClient({ throwOnError: false })

  function applyRemote(snapshot: Snapshot) {
    applying = true
    try {
      // Project/lastProject is keyed by server origin; we only know our own server.
      // Apply each per-origin map directly into the store via reconcile-style replace.
      for (const key of Object.keys(snapshot.projects)) {
        serverCustom!.replaceProjects(key, snapshot.projects[key])
      }
      for (const key of Object.keys(snapshot.lastProject)) {
        serverCustom!.replaceLastProject(key, snapshot.lastProject[key])
      }
      layoutCustom!.replaceSessionTabs(snapshot.sessionTabs)
    } finally {
      // Allow the createEffect's downstream tick to observe the update without
      // immediately PUTting it back. queueMicrotask is too eager (fires before
      // store subscribers); a macrotask is safe.
      setTimeout(() => {
        applying = false
      }, 0)
    }
  }

  async function pull() {
    const client = sdk()
    const res = await client.custom.clientState.get()
    if (res.error) {
      console.warn("[client-state-sync] initial GET failed", res.error)
      return
    }
    const data = res.data
    if (!data || "found" in data) return
    lastSeenAt = data.time_updated
    if (data.device_id === me) return
    const snapshot = deserialize(data.state)
    if (!snapshot) return
    applyRemote(snapshot)
  }

  async function push() {
    if (applying) return
    if (inflight) {
      // coalesce: schedule one more after current
      await inflight
      return push()
    }
    const snapshot = collect(serverCustom!.store, layoutCustom!.store)
    const body = { state: serialize(snapshot), device_id: me, if_match: lastSeenAt || undefined }
    inflight = (async () => {
      const client = sdk()
      const res = await client.custom.clientState.put({ body } as any)
      if (res.error) {
        // 409 conflict — refetch and apply
        if ((res.response as any)?.status === 409) {
          await pull()
          return
        }
        console.warn("[client-state-sync] PUT failed", res.error)
        return
      }
      const row = res.data as { time_updated: number } | undefined
      if (row?.time_updated) lastSeenAt = row.time_updated
    })().finally(() => {
      inflight = undefined
    })
    await inflight
  }

  function schedulePush() {
    if (applying) return
    if (pendingTimer) clearTimeout(pendingTimer)
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined
      void push()
    }, DEBOUNCE_MS)
  }

  onMount(() => {
    void pull()

    // Listen for live updates broadcast by other devices.
    const off = globalSDK.event.listen((e: { name: string; details: Event }) => {
      const payload = e.details
      if (payload.type !== EVENT_TYPE) return
      const props = (payload as { properties: RemoteEventProps }).properties
      if (props.device_id === me) {
        lastSeenAt = Math.max(lastSeenAt, props.time_updated)
        return
      }
      lastSeenAt = props.time_updated
      const snapshot = deserialize(props.state)
      if (!snapshot) return
      applyRemote(snapshot)
    })
    onCleanup(off)
  })

  // Reactive watcher: any change to synced slices triggers a debounced PUT.
  createEffect(
    on(
      () => [
        serverCustom!.store.projects,
        serverCustom!.store.lastProject,
        layoutCustom!.store.sessionTabs,
      ],
      () => schedulePush(),
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (pendingTimer) clearTimeout(pendingTimer)
  })

  return null
}
