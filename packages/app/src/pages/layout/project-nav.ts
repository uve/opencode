import type { Session } from "@opencode-ai/sdk/v2/client"
import { latestRootSession, workspaceKey } from "./helpers"

type Store = {
  path: { directory: string }
  session: Session[]
}

type Last = {
  directory: string
  id: string
}

export function pickImmediateProjectSession(input: { dirs: string[]; last?: Last; stores: Store[]; now: number }) {
  const can = (dir: string | undefined) => {
    if (!dir) return false
    return input.dirs.some((item) => workspaceKey(item) === workspaceKey(dir))
  }
  const last = input.last

  if (last?.id && can(last.directory)) {
    const store = input.stores.find((item) => workspaceKey(item.path.directory) === workspaceKey(last.directory))
    if (store?.session.some((item) => item.id === last.id)) {
      return last
    }
  }

  return latestRootSession(input.stores, input.now)
}

export function prefetchBudget(touch: boolean) {
  if (touch) {
    return {
      chunk: 80,
      concurrency: 1,
      pending: 6,
      span: 2,
    }
  }

  return {
    chunk: 200,
    concurrency: 2,
    pending: 10,
    span: 4,
  }
}
