import { beforeEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Bus } from "../../../src/bus"
import * as CrossSpawnSpawner from "../../../src/effect/cross-spawn-spawner"
import { ClientStateService } from "../../../src/custom/client-state/service"
import { ClientStateUpdated } from "../../../src/custom/client-state/domain"
import { ClientStateTable } from "../../../src/custom/client-state/schema.sql"
import { Database } from "../../../src/storage"
import { provideTmpdirInstance } from "../../fixture/fixture"
import { resetDatabase } from "../../fixture/db"
import { testEffect } from "../../lib/effect"

const it = testEffect(Layer.mergeAll(Bus.layer, CrossSpawnSpawner.defaultLayer))

beforeEach(async () => {
  await resetDatabase()
})

describe("ClientStateService", () => {
  it.live("returns undefined before first write", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const row = yield* Effect.promise(() => ClientStateService.get())
        expect(row).toBeUndefined()
      }),
    ),
  )

  it.live("put persists and returns row", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const row = yield* Effect.promise(() =>
          ClientStateService.put({ state: '{"v":1,"x":1}', device_id: "dev_a" }),
        )
        expect(row.id).toBe("default")
        expect(row.state).toBe('{"v":1,"x":1}')
        expect(row.device_id).toBe("dev_a")
        expect(row.time_updated).toBeGreaterThan(0)

        const stored = yield* Effect.sync(() => Database.use((db) => db.select().from(ClientStateTable).all()))
        expect(stored).toHaveLength(1)
        expect(stored[0].state).toBe('{"v":1,"x":1}')
      }),
    ),
  )

  it.live("put overwrites existing row", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const first = yield* Effect.promise(() =>
          ClientStateService.put({ state: '{"v":1}', device_id: "dev_a" }),
        )
        yield* Effect.sleep(5)
        const second = yield* Effect.promise(() =>
          ClientStateService.put({ state: '{"v":2}', device_id: "dev_b" }),
        )
        expect(second.state).toBe('{"v":2}')
        expect(second.device_id).toBe("dev_b")
        expect(second.time_updated).toBeGreaterThanOrEqual(first.time_updated)
        expect(second.time_created).toBe(first.time_created)
      }),
    ),
  )

  it.live("put with stale if_match throws Conflict and preserves current row", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const first = yield* Effect.promise(() =>
          ClientStateService.put({ state: '{"v":1}', device_id: "dev_a" }),
        )
        yield* Effect.sleep(5)
        const second = yield* Effect.promise(() =>
          ClientStateService.put({ state: '{"v":2}', device_id: "dev_b" }),
        )
        const caught = yield* Effect.promise(async () => {
          try {
            await ClientStateService.put({
              state: '{"v":3}',
              device_id: "dev_a",
              if_match: first.time_updated,
            })
            return undefined as unknown as Error
          } catch (e) {
            return e as Error
          }
        })
        expect(caught).toBeInstanceOf(ClientStateService.Conflict)
        const err = caught as ClientStateService.Conflict
        expect(err.current.state).toBe(second.state)
      }),
    ),
  )

  it.live("put publishes ClientStateUpdated on Bus", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const received: Array<{ state: string; device_id: string; time_updated: number }> = []
        Bus.subscribe(ClientStateUpdated, (evt) => {
          received.push(evt.properties)
        })
        yield* Effect.sleep(10)
        yield* Effect.promise(() => ClientStateService.put({ state: '{"v":1}', device_id: "dev_a" }))
        yield* Effect.sleep(20)
        expect(received).toHaveLength(1)
        expect(received[0].state).toBe('{"v":1}')
        expect(received[0].device_id).toBe("dev_a")
        expect(received[0].time_updated).toBeGreaterThan(0)
      }),
    ),
  )
})
