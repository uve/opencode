import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { apply, collect, deserialize, jsonEquals, SCHEMA_VERSION, serialize } from "./serializer"

describe("client-state-sync serializer", () => {
  test("collect snapshots only whitelisted slices", () => {
    const server = {
      projects: { "http://localhost": [{ worktree: "/a", expanded: true }] },
      lastProject: { "http://localhost": "/a" },
    }
    const layout = {
      sessionTabs: { "k1": { active: "t1", all: ["t1", "t2"] } },
    }

    const snap = collect(server, layout)

    expect(snap.v).toBe(SCHEMA_VERSION)
    expect(snap.projects).toEqual(server.projects)
    expect(snap.lastProject).toEqual(server.lastProject)
    expect(snap.sessionTabs).toEqual(layout.sessionTabs)
    // ensure deep clone (mutation of source must not leak)
    server.projects["http://localhost"][0].expanded = false
    expect(snap.projects["http://localhost"][0].expanded).toBe(true)
  })

  test("serialize + deserialize roundtrip", () => {
    const snap = {
      v: SCHEMA_VERSION,
      projects: { o: [{ worktree: "/x", expanded: false }] },
      lastProject: { o: "/x" },
      sessionTabs: { k: { all: ["t1"] } },
    }
    const back = deserialize(serialize(snap))
    expect(back).toEqual(snap)
  })

  test("deserialize rejects mismatched schema version", () => {
    const stale = { v: 99, projects: {}, lastProject: {}, sessionTabs: {} }
    expect(deserialize(JSON.stringify(stale))).toBeUndefined()
  })

  test("deserialize rejects malformed JSON", () => {
    expect(deserialize("not json")).toBeUndefined()
    expect(deserialize("")).toBeUndefined()
  })

  test("apply replaces store slices and reports changed=true", () => {
    const [server, setServer] = createStore<{
      projects: Record<string, { worktree: string; expanded: boolean }[]>
      lastProject: Record<string, string>
    }>({ projects: {}, lastProject: {} })
    const [layout, setLayout] = createStore<{ sessionTabs: Record<string, { active?: string; all: string[] }> }>({
      sessionTabs: {},
    })

    const changed = apply(
      {
        v: SCHEMA_VERSION,
        projects: { o: [{ worktree: "/x", expanded: true }] },
        lastProject: { o: "/x" },
        sessionTabs: { k: { active: "t1", all: ["t1"] } },
      },
      setServer,
      setLayout,
    )

    expect(changed).toBe(true)
    expect(server.projects["o"]).toEqual([{ worktree: "/x", expanded: true }])
    expect(server.lastProject["o"]).toBe("/x")
    expect(layout.sessionTabs["k"]).toEqual({ active: "t1", all: ["t1"] })
  })

  test("apply returns changed=false when snapshot matches store", () => {
    const init = {
      projects: { o: [{ worktree: "/x", expanded: true }] } as Record<string, { worktree: string; expanded: boolean }[]>,
      lastProject: { o: "/x" } as Record<string, string>,
    }
    const [server, setServer] = createStore<typeof init>(structuredClone(init))
    const [layout, setLayout] = createStore<{ sessionTabs: Record<string, { active?: string; all: string[] }> }>({
      sessionTabs: { k: { all: ["t1"] } },
    })

    const changed = apply(
      {
        v: SCHEMA_VERSION,
        projects: structuredClone(init.projects),
        lastProject: structuredClone(init.lastProject),
        sessionTabs: { k: { all: ["t1"] } },
      },
      setServer,
      setLayout,
    )

    expect(changed).toBe(false)
    // identity preserved (no mutation)
    expect(server.projects["o"][0].worktree).toBe("/x")
    expect(layout.sessionTabs["k"].all).toEqual(["t1"])
  })

  test("jsonEquals deep-compares structurally", () => {
    expect(jsonEquals({ a: [1, 2] }, { a: [1, 2] })).toBe(true)
    expect(jsonEquals({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(jsonEquals(undefined, undefined)).toBe(true)
  })
})
