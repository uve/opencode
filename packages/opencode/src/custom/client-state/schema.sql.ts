/**
 * Cross-device client UI state sync (custom fork).
 *
 * Single-row blob table. Stores the latest serialized client UI state
 * (open projects, open session tabs, last active session per project) so
 * multiple browsers/devices pointed at the same opencode server can stay
 * in sync. Last-write-wins by `time_updated`.
 *
 * Isolation: this file is in src/custom/ so it never collides with upstream
 * schemas under src/{session,storage,share,...}/*.sql.ts.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../../storage/schema.sql"

export const ClientStateTable = sqliteTable("client_state", {
  // Always "default" — single shared blob per server instance.
  // We could later partition per-account, but auth is single-user today.
  id: text().primaryKey(),
  state: text().notNull(), // serialized JSON blob
  device_id: text().notNull(), // last writer's device id (for echo suppression)
  ...Timestamps,
})
