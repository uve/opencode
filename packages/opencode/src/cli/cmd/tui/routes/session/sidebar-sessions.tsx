import { useSync } from "@tui/context/sync"
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { Locale } from "@/util/locale"
import { Spinner } from "../../component/spinner"

export function SessionsSidebar(props: { overlay?: boolean }) {
  const sync = useSync()
  const { theme } = useTheme()
  const route = useRoute()

  const current = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))

  // Все сессии без родителя, отсортированные по обновлению (свежие сверху)
  const sessions = createMemo(() =>
    sync.data.session
      .filter((x) => !x.parentID)
      .toSorted((a, b) => b.time.updated - a.time.updated),
  )

  const status = (id: string) => {
    const s = sync.data.session_status?.[id]
    if (s?.type === "busy") return "working"
    return sync.session.status(id)
  }

  const color = (id: string) => {
    const s = status(id)
    if (s === "working") return theme.warning
    if (s === "compacting") return theme.accent
    return theme.success
  }

  const badge = (id: string) => {
    const s = status(id)
    if (s === "working") return "▶"
    if (s === "compacting") return "◎"
    return "•"
  }

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={38}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      position={props.overlay ? "absolute" : "relative"}
    >
      <box paddingBottom={1}>
        <text fg={theme.text}>
          <b>Sessions</b>{" "}
          <span style={{ fg: theme.textMuted }}>({sessions().length})</span>
        </text>
      </box>
      <scrollbox
        flexGrow={1}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <box flexShrink={0} gap={0} paddingRight={1}>
          <For each={sessions()}>
            {(session) => {
              const active = createMemo(() => session.id === current())
              const dir = createMemo(() => {
                const parts = session.directory.split("/")
                return parts[parts.length - 1] ?? session.directory
              })
              return (
                <box
                  backgroundColor={active() ? theme.backgroundElement : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseDown={() => {
                    route.navigate({
                      type: "session",
                      sessionID: session.id,
                    })
                  }}
                >
                  <box flexDirection="row" gap={1}>
                    <Show
                      when={status(session.id) !== "working"}
                      fallback={<Spinner color={color(session.id)} />}
                    >
                      <text flexShrink={0} fg={color(session.id)}>
                        {badge(session.id)}
                      </text>
                    </Show>
                    <text fg={active() ? theme.text : theme.textMuted} wrapMode="none">
                      {Locale.truncate(session.title, 30)}
                    </text>
                  </box>
                  <box flexDirection="row" justifyContent="space-between" paddingLeft={2}>
                    <text fg={theme.textMuted}>{dir()}</text>
                    <text fg={theme.textMuted}>{Locale.time(session.time.updated)}</text>
                  </box>
                </box>
              )
            }}
          </For>
        </box>
      </scrollbox>
    </box>
  )
}
