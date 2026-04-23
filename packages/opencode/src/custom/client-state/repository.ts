/**
 * Repository layer for client UI state sync (custom fork).
 *
 * Wraps Drizzle/SQLite access. Pure synchronous reads/writes — the table is a
 * single-row blob so contention is negligible. No business logic here.
 */
import { Database, eq } from "@/storage"
import { ClientStateTable } from "./schema.sql"
import { SINGLETON_ID, type ClientState } from "./domain"

export function read(): ClientState | undefined {
  return Database.use((db) => db.select().from(ClientStateTable).where(eq(ClientStateTable.id, SINGLETON_ID)).get())
}

export function write(input: { state: string; device_id: string }): ClientState {
  const now = Date.now()
  return Database.use((db) =>
    db
      .insert(ClientStateTable)
      .values({
        id: SINGLETON_ID,
        state: input.state,
        device_id: input.device_id,
        time_created: now,
        time_updated: now,
      })
      .onConflictDoUpdate({
        target: ClientStateTable.id,
        set: {
          state: input.state,
          device_id: input.device_id,
          time_updated: now,
        },
      })
      .returning()
      .get(),
  )
}

export * as ClientStateRepository from "./repository"
