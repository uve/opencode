import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { useNotification } from "@/context/notification"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useSessionsRegistry, type RegistrySession } from "./sessions-registry"

const MAX_TABS_DESKTOP = 10
const MAX_TABS_MOBILE = 5
const MOBILE_BREAKPOINT = 768

export function SessionTabsStrip() {
  const registry = useSessionsRegistry()
  const notification = useNotification()
  const params = useParams()

  const [isMobile, setIsMobile] = createSignal(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false,
  )

  onMount(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    update()
    window.addEventListener("resize", update)
    onCleanup(() => window.removeEventListener("resize", update))
  })

  const maxTabs = createMemo(() => (isMobile() ? MAX_TABS_MOBILE : MAX_TABS_DESKTOP))

  const tabs = createMemo(() => registry.allSessions().slice(0, maxTabs()))

  // Update document title with count of completed unseen sessions
  const unseen = createMemo(() => {
    let count = 0
    for (const tab of tabs()) {
      if (notification.session.unseenCount(tab.id) > 0) count++
    }
    return count
  })

  createEffect(() => {
    const count = unseen()
    const active = tabs().find((t) => t.id === params.id)
    const name = active?.title || "Untitled"
    const prefix = count > 0 ? `(${count}) ` : ""
    document.title = `${prefix}${name} — opencode`
  })

  return (
    <Show when={tabs().length > 0}>
      <div class="flex items-center gap-1 px-2 min-w-0 overflow-x-auto no-scrollbar">
        <For each={tabs()}>{(tab) => <SessionTab tab={tab} active={params.id === tab.id} />}</For>
      </div>
    </Show>
  )
}

function SessionTab(props: { tab: RegistrySession; active: boolean }) {
  const registry = useSessionsRegistry()
  const notification = useNotification()

  const status = createMemo(() => {
    const store = registry.getStore(props.tab.worktree)
    return store?.session_status[props.tab.id]
  })
  const working = createMemo(() => {
    const s = status()
    return s?.type === "busy" || s?.type === "retry"
  })
  const done = createMemo(() => status()?.type === "idle")
  const hasUnseen = createMemo(() => notification.session.unseenCount(props.tab.id) > 0)
  const hasError = createMemo(() => notification.session.unseenHasError(props.tab.id))
  const completed = createMemo(() => done() && hasUnseen())
  const letter = createMemo(() => (props.tab.title?.[0] ?? "?").toUpperCase())

  return (
    <A
      href={`/${props.tab.slug}/session/${props.tab.id}`}
      classList={{
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shrink-0 max-w-[180px] min-w-0 transition-colors select-none": true,
        "border-2 border-text-strong bg-surface-base-active": props.active,
        "border border-dashed border-border-base": !props.active,
        "bg-green-950/60 hover:bg-green-900/60": !props.active && completed() && !hasError(),
        "bg-red-950/40 hover:bg-red-900/40": !props.active && hasError(),
        "hover:bg-surface-raised-base-hover": !props.active && !completed() && !hasError(),
      }}
    >
      <div
        classList={{
          "size-5 rounded-full flex items-center justify-center text-[11px] font-semibold leading-none shrink-0 transition-colors": true,
          "bg-green-500 text-white": completed() && !hasError(),
          "bg-red-500 text-white": hasError(),
          "bg-surface-raised-base text-text-weak": !completed() && !hasError(),
        }}
      >
        <Show when={working()} fallback={letter()}>
          <Spinner class="size-3" />
        </Show>
      </div>
      <span
        classList={{
          "text-12-regular truncate": true,
          "font-semibold text-text-strong": props.active,
          "text-green-300": !props.active && completed() && !hasError(),
          "text-red-300": !props.active && hasError(),
          "text-text-strong": !props.active && !completed() && !hasError(),
        }}
      >
        {props.tab.title || "Untitled"}
      </span>
    </A>
  )
}
