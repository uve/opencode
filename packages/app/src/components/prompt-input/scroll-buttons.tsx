import { Icon } from "@opencode-ai/ui/icon"
import { createSignal } from "solid-js"

const COOLDOWN = 500
const AMOUNT = 300

function target() {
  const main = document.querySelector("main")
  if (main) {
    const vp = main.querySelector(".scroll-view__viewport")
    if (vp) return vp
  }
  return document.scrollingElement ?? document.documentElement
}

export function ScrollButtons() {
  const [upLocked, setUpLocked] = createSignal(false)
  const [downLocked, setDownLocked] = createSignal(false)

  const scroll = (dir: 1 | -1) => {
    const locked = dir === -1 ? upLocked : downLocked
    const setLocked = dir === -1 ? setUpLocked : setDownLocked
    if (locked()) return
    setLocked(true)
    target().scrollBy({ top: dir * AMOUNT, behavior: "smooth" })
    setTimeout(() => setLocked(false), COOLDOWN)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={upLocked()}
        aria-label="Scroll up"
        class="flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full border border-black bg-[color-mix(in_srgb,var(--color-surface-raised-base)_80%,transparent)] text-text-strong outline-none select-none cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
        classList={{
          "opacity-40 cursor-not-allowed": upLocked(),
        }}
      >
        <Icon name="arrow-up" size="large" class="md:!size-8" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={downLocked()}
        aria-label="Scroll down"
        class="flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full border border-black bg-[color-mix(in_srgb,var(--color-surface-raised-base)_80%,transparent)] text-text-strong outline-none select-none cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
        classList={{
          "opacity-40 cursor-not-allowed": downLocked(),
        }}
      >
        <Icon name="arrow-down" size="large" class="md:!size-8" />
      </button>
    </>
  )
}
