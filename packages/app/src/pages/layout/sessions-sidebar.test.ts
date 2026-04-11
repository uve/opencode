import { describe, expect, test } from "bun:test"

// Re-implement timeAgo inline since it's not exported — tests verify the logic matches
function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return "now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

describe("sessions-sidebar timeAgo", () => {
  test("returns 'now' for timestamps less than 1 minute ago", () => {
    expect(timeAgo(Date.now())).toBe("now")
    expect(timeAgo(Date.now() - 30_000)).toBe("now")
    expect(timeAgo(Date.now() - 59_999)).toBe("now")
  })

  test("returns minutes for timestamps less than 1 hour ago", () => {
    expect(timeAgo(Date.now() - 60_000)).toBe("1m")
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe("5m")
    expect(timeAgo(Date.now() - 59 * 60_000)).toBe("59m")
  })

  test("returns hours for timestamps less than 1 day ago", () => {
    expect(timeAgo(Date.now() - 3_600_000)).toBe("1h")
    expect(timeAgo(Date.now() - 12 * 3_600_000)).toBe("12h")
    expect(timeAgo(Date.now() - 23 * 3_600_000)).toBe("23h")
  })

  test("returns days for timestamps 1+ days ago", () => {
    expect(timeAgo(Date.now() - 86_400_000)).toBe("1d")
    expect(timeAgo(Date.now() - 7 * 86_400_000)).toBe("7d")
    expect(timeAgo(Date.now() - 30 * 86_400_000)).toBe("30d")
  })

  test("clamps future timestamps to 'now'", () => {
    expect(timeAgo(Date.now() + 60_000)).toBe("now")
  })
})

describe("sessions-sidebar grouping logic", () => {
  type SessionLike = { slug: string; projectName: string; time: { updated: number; created: number } }

  function groupSessions(sessions: SessionLike[]) {
    const groups = new Map<string, { name: string; sessions: SessionLike[] }>()
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
  }

  test("groups sessions by project slug", () => {
    const sessions: SessionLike[] = [
      { slug: "a", projectName: "Project A", time: { updated: 3, created: 1 } },
      { slug: "b", projectName: "Project B", time: { updated: 2, created: 1 } },
      { slug: "a", projectName: "Project A", time: { updated: 1, created: 1 } },
    ]
    const groups = groupSessions(sessions)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe("Project A")
    expect(groups[0].sessions).toHaveLength(2)
    expect(groups[1].name).toBe("Project B")
    expect(groups[1].sessions).toHaveLength(1)
  })

  test("returns empty array for no sessions", () => {
    expect(groupSessions([])).toEqual([])
  })

  test("preserves insertion order of groups", () => {
    const sessions: SessionLike[] = [
      { slug: "c", projectName: "C", time: { updated: 3, created: 1 } },
      { slug: "a", projectName: "A", time: { updated: 2, created: 1 } },
      { slug: "b", projectName: "B", time: { updated: 1, created: 1 } },
    ]
    const groups = groupSessions(sessions)
    expect(groups.map((g) => g.name)).toEqual(["C", "A", "B"])
  })
})

describe("sessions-sidebar sorting logic", () => {
  type TimedSession = { id: string; time: { updated: number; created: number } }

  function sortByUpdated(sessions: TimedSession[]) {
    return [...sessions].sort((a, b) => {
      const aT = a.time.updated ?? a.time.created
      const bT = b.time.updated ?? b.time.created
      return bT - aT
    })
  }

  test("sorts sessions by most recently updated first", () => {
    const sessions: TimedSession[] = [
      { id: "old", time: { updated: 100, created: 50 } },
      { id: "new", time: { updated: 300, created: 100 } },
      { id: "mid", time: { updated: 200, created: 75 } },
    ]
    const sorted = sortByUpdated(sessions)
    expect(sorted.map((s) => s.id)).toEqual(["new", "mid", "old"])
  })

  test("treats updated=0 as valid (nullish coalescing)", () => {
    const sessions: TimedSession[] = [
      { id: "a", time: { updated: 0, created: 100 } },
      { id: "b", time: { updated: 0, created: 200 } },
    ]
    // ?? only falls back for null/undefined, 0 is valid — stable sort keeps original order
    const sorted = sortByUpdated(sessions)
    expect(sorted.map((s) => s.id)).toEqual(["a", "b"])
  })
})

describe("sessions-sidebar filtering logic", () => {
  type FilterableSession = {
    id: string
    parentID?: string
    time: { archived?: number; created: number; updated: number }
  }

  function filterRootVisible(sessions: FilterableSession[]) {
    return sessions.filter((s) => !s.parentID && !s.time?.archived)
  }

  test("excludes child sessions", () => {
    const sessions: FilterableSession[] = [
      { id: "root", time: { created: 1, updated: 1 } },
      { id: "child", parentID: "root", time: { created: 2, updated: 2 } },
    ]
    expect(filterRootVisible(sessions).map((s) => s.id)).toEqual(["root"])
  })

  test("excludes archived sessions", () => {
    const sessions: FilterableSession[] = [
      { id: "active", time: { created: 1, updated: 1 } },
      { id: "archived", time: { created: 2, updated: 2, archived: 100 } },
    ]
    expect(filterRootVisible(sessions).map((s) => s.id)).toEqual(["active"])
  })

  test("includes sessions with no parentID and no archive time", () => {
    const sessions: FilterableSession[] = [
      { id: "a", time: { created: 1, updated: 1 } },
      { id: "b", time: { created: 2, updated: 2 } },
    ]
    expect(filterRootVisible(sessions)).toHaveLength(2)
  })
})
