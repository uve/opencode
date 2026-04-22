import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { useNotification } from "@/context/notification"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Icon } from "@opencode-ai/ui/icon"
import { useSessionsRegistry, type RegistrySession } from "./sessions-registry"
import { useVoice } from "./right-rail/voice-context"

// Safe wrapper: useVoice throws if VoiceProvider isn't above us in the tree.
// CustomMount sits in AppShellProviders (above SessionProviders where
// VoiceProvider lives), so we degrade gracefully when voice is unavailable.
function tryUseVoice() {
  try {
    return useVoice()
  } catch {
    return undefined
  }
}

const MAX_TABS = 30 // hard cap; visible count limited by horizontal scroll
const MOBILE_BREAKPOINT = 768

export function SessionTabsStrip() {
  const registry = useSessionsRegistry()
  const params = useParams()
  const voice = tryUseVoice()

  const [isMobile, setIsMobile] = createSignal(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false,
  )

  onMount(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    update()
    window.addEventListener("resize", update)
    onCleanup(() => window.removeEventListener("resize", update))
  })

  const tabs = createMemo(() => registry.top(MAX_TABS))

  // Update document title with the active tab's name.
  createEffect(() => {
    const active = tabs().find((t) => t.id === params.id)
    const name = active?.title || "Untitled"
    document.title = `${name} — opencode`
  })

  let stripRef: HTMLDivElement | undefined
  const [canLeft, setCanLeft] = createSignal(false)
  const [canRight, setCanRight] = createSignal(false)

  function updateScrollState() {
    const el = stripRef
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  // Patch the upstream titlebar so:
  //  1) center grid track is 1fr (not auto), so strip uses ALL available width
  //  2) pointer-events on ancestors do not block iOS native horizontal scroll
  onMount(() => {
    const style = document.createElement("style")
    style.setAttribute("data-custom-style", "session-tabs-strip")
    style.textContent = `
      /* Grid: left auto, center 1fr, right auto.
         This gives the tab strip ALL available horizontal space between
         the left UI cluster and the right UI cluster. */
      header[data-tauri-drag-region] {
        grid-template-columns: auto minmax(0, 1fr) auto !important;
      }
      /* Restore pointer-events on the slot wrapper and ancestors so iOS
         Safari hit-testing inside the scroll container works. */
      header[data-tauri-drag-region] { pointer-events: auto !important; }
      header[data-tauri-drag-region] > div { pointer-events: auto !important; }
      header > div:has(> #opencode-titlebar-center) {
        min-width: 0;
        overflow: hidden;
        pointer-events: auto !important;
      }
      #opencode-titlebar-center {
        max-width: 100% !important;
        width: 100% !important;
        justify-content: flex-start !important;
        pointer-events: auto !important;
      }
      [data-component="session-tabs-strip"] {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        touch-action: pan-x !important;
        -webkit-overflow-scrolling: touch !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        overscroll-behavior-x: contain !important;
        pointer-events: auto !important;
        -webkit-user-select: none;
        user-select: none;
      }
      [data-component="session-tabs-strip"] a {
        touch-action: pan-x !important;
        pointer-events: auto !important;
      }
    `
    document.head.appendChild(style)
    onCleanup(() => style.remove())
  })

  // Horizontal wheel scrolling (desktop).
  onMount(() => {
    if (!stripRef) return
    const onWheel = (e: WheelEvent) => {
      if (stripRef!.scrollWidth <= stripRef!.clientWidth) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      stripRef!.scrollLeft += e.deltaY
    }
    stripRef.addEventListener("wheel", onWheel, { passive: false })
    onCleanup(() => stripRef?.removeEventListener("wheel", onWheel))
  })

  // Track scroll position for left/right button visibility.
  onMount(() => {
    if (!stripRef) return
    updateScrollState()
    const onScroll = () => updateScrollState()
    stripRef.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(stripRef)
    onCleanup(() => {
      stripRef?.removeEventListener("scroll", onScroll)
      ro.disconnect()
    })
  })

  // Re-evaluate scroll state when tab list changes.
  createEffect(() => {
    tabs().length
    queueMicrotask(updateScrollState)
  })

  // Keep the active tab visible — but ONLY when the active session id
  // actually changes (e.g. user navigates). We never re-scroll on list
  // re-render so iOS native momentum swipes are never interrupted.
  let lastScrolledId: string | undefined
  createEffect(() => {
    const id = params.id
    if (!id || !stripRef) return
    if (id === lastScrolledId) return
    lastScrolledId = id
    queueMicrotask(() => {
      const el = stripRef?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    })
  })

  function scrollByDelta(delta: number) {
    stripRef?.scrollBy({ left: delta, behavior: "smooth" })
  }

  return (
    <Show when={tabs().length > 0}>
      <div class="flex items-center w-full min-w-0 gap-0.5">
        <ScrollButton
          direction="left"
          visible={canLeft()}
          onClick={() => scrollByDelta(-240)}
        />
        <div
          ref={stripRef}
          data-component="session-tabs-strip"
          class="flex items-center gap-1 px-1 min-w-0 overflow-x-auto no-scrollbar"
          style={{ "touch-action": "pan-x", "-webkit-overflow-scrolling": "touch" }}
        >
          <For each={tabs()}>
            {(tab) => (
              <SessionTab
                tab={tab}
                activeId={() => params.id}
                mobile={isMobile()}
                onTabClick={(e, href) => {
                  // Recorder is transcribing — defer navigation until done so
                  // the in-flight speech is sent to the CAPTURED session, not
                  // mistakenly to the new one. The voice context owns the
                  // pending-nav queue and fires it when transcribing flips
                  // false (last write wins).
                  if (voice?.recorder.transcribing()) {
                    e.preventDefault()
                    voice.recorder.queueNavigation(href)
                    console.log("[VoiceTabs] deferring navigation to", tab.title || "Untitled")
                  }
                }}
              />
            )}
          </For>
        </div>
        <ScrollButton
          direction="right"
          visible={canRight()}
          onClick={() => scrollByDelta(240)}
        />
      </div>
    </Show>
  )
}

function ScrollButton(props: {
  direction: "left" | "right"
  visible: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.direction === "left" ? "Scroll tabs left" : "Scroll tabs right"}
      class="shrink-0 size-7 rounded-md flex items-center justify-center transition-opacity hover:bg-surface-raised-base-hover"
      classList={{
        "opacity-100": props.visible,
        "opacity-30 cursor-default": !props.visible,
      }}
    >
      <Icon
        name={props.direction === "left" ? "chevron-left" : "chevron-right"}
        size="small"
      />
    </button>
  )
}

function SessionTab(props: {
  tab: RegistrySession
  activeId: () => string | undefined
  mobile: boolean
  onTabClick?: (e: MouseEvent, href: string) => void
}) {
  const registry = useSessionsRegistry()
  const notification = useNotification()

  const active = createMemo(() => props.activeId() === props.tab.id)
  const href = `/${props.tab.slug}/session/${props.tab.id}`

  // Optimistic loading: when user clicks, show spinner until URL params catches up.
  const [pendingClick, setPendingClick] = createSignal(false)
  createEffect(() => {
    if (active()) setPendingClick(false)
  })

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
  const showSpinner = createMemo(() => working() || pendingClick())

  return (
    <A
      href={href}
      data-tab-id={props.tab.id}
      onClick={(e) => {
        props.onTabClick?.(e, href)
        if (e.defaultPrevented) {
          // Still highlight to give feedback that click was registered.
          if (!active()) setPendingClick(true)
          return
        }
        if (!active()) setPendingClick(true)
      }}
      classList={{
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shrink-0 min-w-0 transition-colors": true,
        "max-w-[120px]": props.mobile,
        "max-w-[180px]": !props.mobile,
        "border-2 border-text-strong bg-surface-base-active": active() || pendingClick(),
        "border border-dashed border-border-base": !active() && !pendingClick(),
        "bg-green-950/60 hover:bg-green-900/60": !active() && !pendingClick() && completed() && !hasError(),
        "bg-red-950/40 hover:bg-red-900/40": !active() && !pendingClick() && hasError(),
        "hover:bg-surface-raised-base-hover":
          !active() && !pendingClick() && !completed() && !hasError(),
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
        <Show when={showSpinner()} fallback={letter()}>
          <Spinner class="size-3" />
        </Show>
      </div>
      <span
        classList={{
          "text-12-regular truncate": true,
          "font-semibold text-text-strong": active() || pendingClick(),
          "text-green-300": !active() && !pendingClick() && completed() && !hasError(),
          "text-red-300": !active() && !pendingClick() && hasError(),
          "text-text-strong": !active() && !pendingClick() && !completed() && !hasError(),
        }}
      >
        {props.tab.title || "Untitled"}
      </span>
    </A>
  )
}
