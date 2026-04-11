import { createEffect, createMemo, For, Show } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { Portal } from "solid-js/web"
import { useLayout } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { useNotification } from "@/context/notification"
import { Spinner } from "@opencode-ai/ui/spinner"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import type { Session } from "@opencode-ai/sdk/v2/client"

const MAX_TABS = 5

type Tab = Session & { slug: string; name: string }

export function SessionTabsStrip() {
  const layout = useLayout()
  const globalSync = useGlobalSync()
  const notification = useNotification()
  const params = useParams()

  const tabs = createMemo(() => {
    const projects = layout.projects.list()
    const seen = new Set<string>()
    const result: Tab[] = []

    for (const project of projects) {
      const [store] = globalSync.child(project.worktree, { bootstrap: true })
      const sessions = store.session ?? []
      const slug = base64Encode(project.worktree)
      const name = project.name || getFilename(project.worktree)

      for (const session of sessions) {
        if (session.parentID || session.time?.archived) continue
        if (seen.has(session.id)) continue
        seen.add(session.id)
        result.push({ ...session, slug, name })
      }
    }

    result.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))

    return result.slice(0, MAX_TABS)
  })

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

  const mount = createMemo(() => document.getElementById("opencode-titlebar-left"))

  return (
    <Show when={mount()}>
      {(el) => (
        <Portal mount={el()}>
          <Show when={tabs().length > 0}>
            <div class="flex items-center gap-1 px-1 overflow-x-auto no-scrollbar">
              <For each={tabs()}>{(tab) => <SessionTab tab={tab} active={params.id === tab.id} />}</For>
            </div>
          </Show>
        </Portal>
      )}
    </Show>
  )
}

function SessionTab(props: { tab: Tab; active: boolean }) {
  const globalSync = useGlobalSync()
  const notification = useNotification()

  const [store] = globalSync.child(props.tab.directory)

  const status = createMemo(() => store.session_status[props.tab.id])
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
