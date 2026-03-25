import { createMemo, For, Show, Switch, Match, type JSX } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { useNotification } from "@/context/notification"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import type { Session } from "@opencode-ai/sdk/v2/client"

type SessionWithProject = Session & { projectName: string; slug: string }

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return "now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

export function SessionsSidebar(props: { archiveSession: (session: Session) => Promise<void> }) {
  const layout = useLayout()
  const globalSync = useGlobalSync()
  const params = useParams()

  const allSessions = createMemo(() => {
    const projects = layout.projects.list()
    const result: SessionWithProject[] = []

    for (const project of projects) {
      const [store] = globalSync.child(project.worktree, { bootstrap: true })
      const sessions = store.session ?? []
      const slug = base64Encode(project.worktree)
      const name = project.name || getFilename(project.worktree)

      for (const session of sessions) {
        if (session.parentID || session.time?.archived) continue
        result.push({ ...session, projectName: name, slug })
      }
    }

    result.sort((a, b) => {
      const aT = a.time.updated ?? a.time.created
      const bT = b.time.updated ?? b.time.created
      return bT - aT
    })

    return result
  })

  const grouped = createMemo(() => {
    const sessions = allSessions()
    const groups = new Map<string, { name: string; sessions: SessionWithProject[] }>()
    for (const session of sessions) {
      const key = session.slug
      let group = groups.get(key)
      if (!group) {
        group = { name: session.projectName, sessions: [] }
        groups.set(key, group)
      }
      group.sessions.push(session)
    }
    return [...groups.values()]
  })

  return (
    <div class="h-full flex flex-col bg-background-base border-t border-border-weak-base rounded-tr-[12px]">
      <div class="flex items-center justify-between px-3 h-10 shrink-0">
        <span class="text-12-semibold text-text-strong uppercase tracking-wide">Sessions</span>
        <Tooltip value="Close" placement="left">
          <IconButton
            icon="close"
            size="small"
            variant="ghost"
            class="size-6 rounded-md"
            onClick={() => layout.sessionsSidebar.close()}
          />
        </Tooltip>
      </div>
      <div class="flex-1 overflow-y-auto overflow-x-hidden py-1">
        <For each={grouped()}>
          {(group) => (
            <div class="mb-1">
              <div class="px-3 py-1.5 text-11-semibold text-text-dimmed uppercase tracking-wider truncate">
                {group.name}
              </div>
              <For each={group.sessions}>
                {(session) => (
                  <SessionRow
                    session={session}
                    slug={session.slug}
                    active={params.id === session.id}
                    archiveSession={props.archiveSession}
                  />
                )}
              </For>
            </div>
          )}
        </For>
        <Show when={allSessions().length === 0}>
          <div class="px-3 py-4 text-12-regular text-text-dimmed text-center">No sessions</div>
        </Show>
      </div>
    </div>
  )
}

function SessionRow(props: {
  session: SessionWithProject
  slug: string
  active: boolean
  archiveSession: (session: Session) => Promise<void>
}): JSX.Element {
  const globalSync = useGlobalSync()
  const notification = useNotification()
  const language = useLanguage()

  const [sessionStore] = globalSync.child(props.session.directory)

  const status = createMemo(() => sessionStore.session_status[props.session.id])
  const isWorking = createMemo(() => {
    const s = status()
    return (
      s?.type === "busy" ||
      s?.type === "retry" ||
      (s !== undefined && s.type !== "idle")
    )
  })
  const isDone = createMemo(() => status()?.type === "idle")

  const hasError = createMemo(() => notification.session.unseenHasError(props.session.id))
  const unseenCount = createMemo(() => notification.session.unseenCount(props.session.id))
  const updatedAt = createMemo(() => props.session.time.updated ?? props.session.time.created)

  return (
    <div class="group/row relative w-full min-w-0 rounded-md hover:bg-surface-raised-base-hover transition-colors">
      <div class="flex items-center min-w-0">
        <A
          href={`/${props.slug}/session/${props.session.id}`}
          classList={{
            "flex items-center gap-1.5 pl-3 py-1 min-w-0 flex-1 text-left focus:outline-none": true,
            "bg-surface-base-active rounded-md": props.active,
          }}
          onClick={() => {
            if (window.innerWidth < 1280) layout.sessionsSidebar.close()
          }}
        >
          <div class="shrink-0 size-5 flex items-center justify-center">
            <Switch fallback={<Icon name="dash" size="small" class="text-icon-weak" />}>
              <Match when={isWorking()}>
                <Spinner class="size-3.5" />
              </Match>
              <Match when={hasError()}>
                <div class="size-1.5 rounded-full bg-text-diff-delete-base" />
              </Match>
              <Match when={unseenCount() > 0}>
                <div class="size-1.5 rounded-full bg-text-interactive-base" />
              </Match>
              <Match when={isDone()}>
                <span class="text-xs leading-none">✅</span>
              </Match>
            </Switch>
          </div>
          <span class="text-13-regular text-text-strong min-w-0 flex-1 truncate">
            {props.session.title}
          </span>
          <span class="shrink-0 text-11-regular text-text-dimmed">{timeAgo(updatedAt())}</span>
        </A>
        <div class="shrink-0 pr-1">
          <Tooltip value={language.t("common.archive")} placement="left">
            <IconButton
              icon="archive"
              variant="ghost"
              class="size-6 rounded-md"
              aria-label={language.t("common.archive")}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void props.archiveSession(props.session)
              }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
