/**
 * Slot primitives — the only contract between upstream files and `custom/`.
 *
 * Two flavors:
 *   1. <Slot id="…" />            → render an anchor in upstream (when we own the file).
 *   2. <SlotPortal selector="…">  → portal into ANY existing DOM node (best for upstream
 *                                    elements that already have a stable id/data attribute).
 *
 * Both wait for the target via MutationObserver, so order of mount doesn't matter
 * and lazy-loaded routes are fine. Missing target → silent no-op.
 */
import { children, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"

const SLOT_ATTR = "data-custom-slot"

export function Slot(props: { id: string; class?: string }) {
  return <div {...{ [SLOT_ATTR]: props.id }} class={props.class} />
}

export function SlotPortal(props: { id?: string; selector?: string; children: JSX.Element }) {
  const selector = () => props.selector ?? `[${SLOT_ATTR}="${props.id}"]`
  const [mount, setMount] = createSignal<HTMLElement | null>(null)
  const resolved = children(() => props.children)

  onMount(() => {
    const find = () => document.querySelector<HTMLElement>(selector())
    let el = find()
    if (el) {
      setMount(el)
      return
    }
    const observer = new MutationObserver(() => {
      el = find()
      if (el) {
        setMount(el)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    onCleanup(() => observer.disconnect())
  })

  return (
    <Show when={mount()}>
      {(target) => <Portal mount={target()}>{resolved()}</Portal>}
    </Show>
  )
}

/**
 * Inject CSS that hides upstream elements without touching their JSX.
 * Stylesheet is appended to <head> on mount so it always wins specificity battles.
 */
export function CssHide(props: { selector: string }) {
  onMount(() => {
    const style = document.createElement("style")
    style.setAttribute("data-custom-hide", props.selector)
    style.textContent = `${props.selector} { display: none !important; visibility: hidden !important; }`
    document.head.appendChild(style)
    onCleanup(() => style.remove())
  })
  return null
}
