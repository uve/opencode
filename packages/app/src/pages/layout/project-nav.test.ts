import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { pickImmediateProjectSession, prefetchBudget } from "./project-nav"

const session = (input: Partial<Session> & Pick<Session, "id" | "directory">) =>
  ({
    parentID: undefined,
    title: "",
    version: "",
    time: { created: 0, updated: 0 },
    ...input,
  }) as Session

describe("pickImmediateProjectSession", () => {
  test("prefers remembered cached session in project dirs", () => {
    const result = pickImmediateProjectSession({
      dirs: ["/repo", "/repo/a"],
      last: { directory: "/repo/a", id: "s2" },
      stores: [
        {
          path: { directory: "/repo" },
          session: [session({ id: "s1", directory: "/repo", time: { created: 1, updated: 1 } })],
        },
        {
          path: { directory: "/repo/a" },
          session: [session({ id: "s2", directory: "/repo/a", time: { created: 2, updated: 2 } })],
        },
      ],
      now: 10,
    })

    expect(result).toEqual({ directory: "/repo/a", id: "s2" })
  })

  test("falls back to latest cached root session", () => {
    const result = pickImmediateProjectSession({
      dirs: ["/repo", "/repo/a"],
      last: { directory: "/repo/a", id: "missing" },
      stores: [
        {
          path: { directory: "/repo" },
          session: [session({ id: "s1", directory: "/repo", time: { created: 1, updated: 5000 } })],
        },
        {
          path: { directory: "/repo/a" },
          session: [session({ id: "s2", directory: "/repo/a", time: { created: 1, updated: 8000 } })],
        },
      ],
      now: 100000,
    })

    expect(result?.id).toBe("s2")
    expect(result?.directory).toBe("/repo/a")
  })

  test("ignores remembered session outside current project", () => {
    const result = pickImmediateProjectSession({
      dirs: ["/repo"],
      last: { directory: "/other", id: "s9" },
      stores: [
        {
          path: { directory: "/repo" },
          session: [session({ id: "s1", directory: "/repo", time: { created: 3, updated: 3 } })],
        },
      ],
      now: 10,
    })

    expect(result?.id).toBe("s1")
    expect(result?.directory).toBe("/repo")
  })

  test("returns undefined when nothing is cached", () => {
    const result = pickImmediateProjectSession({
      dirs: ["/repo"],
      stores: [{ path: { directory: "/repo" }, session: [] }],
      now: 10,
    })

    expect(result).toBeUndefined()
  })
})

describe("prefetchBudget", () => {
  test("shrinks prefetch on touch devices", () => {
    expect(prefetchBudget(true)).toEqual({
      chunk: 80,
      concurrency: 1,
      pending: 6,
      span: 2,
    })
  })

  test("keeps desktop prefetch defaults", () => {
    expect(prefetchBudget(false)).toEqual({
      chunk: 200,
      concurrency: 2,
      pending: 10,
      span: 4,
    })
  })
})
