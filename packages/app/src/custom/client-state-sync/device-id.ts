/**
 * Per-tab device id for client-state sync (custom fork).
 *
 * Each browser tab gets a stable id stored in sessionStorage. The id travels
 * with every PUT and every server-broadcast event so each tab can suppress
 * echoes of its own writes (avoiding feedback loops).
 *
 * sessionStorage is intentional: a fresh tab is a fresh device for sync
 * purposes, but reload preserves the id so we don't double-apply our own
 * pending write.
 */
const KEY = "opencode.custom.client-state.device_id"

function generate(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function deviceId(): string {
  if (typeof sessionStorage === "undefined") return generate()
  const cached = sessionStorage.getItem(KEY)
  if (cached) return cached
  const fresh = generate()
  sessionStorage.setItem(KEY, fresh)
  return fresh
}
