/**
 * Domain layer for cross-device client UI state sync (custom fork).
 *
 * Pure types and Bus event definition. No I/O, no Drizzle, no Hono imports.
 *
 * Conflict resolution rule: last-write-wins by `time_updated` (server clock).
 * The `device_id` of the writer is propagated through the Bus event so other
 * tabs/devices can suppress echoes of their own writes.
 */
import z from "zod"
import { Schema } from "effect"
import { BusEvent } from "@/bus/bus-event"

/** Single shared blob per server instance — single-user model. */
export const SINGLETON_ID = "default"

/** Opaque JSON-encoded UI state. The server treats it as a black box. */
export const ClientState = z
  .object({
    id: z.string(),
    state: z.string(),
    device_id: z.string(),
    time_created: z.number(),
    time_updated: z.number(),
  })
  .meta({ ref: "CustomClientState" })
export type ClientState = z.infer<typeof ClientState>

/** Body of PUT /custom/client-state. */
export const ClientStateInput = z
  .object({
    state: z.string(),
    device_id: z.string(),
    /**
     * Optional optimistic concurrency token: client passes the time_updated
     * it last observed. Server rejects with 409 if a newer write exists.
     * Omit to force overwrite.
     */
    if_match: z.number().optional(),
  })
  .meta({ ref: "CustomClientStateInput" })
export type ClientStateInput = z.infer<typeof ClientStateInput>

/**
 * Bus event broadcast on every successful write.
 * Frontend filters by device_id to ignore echoes of its own writes.
 */
export const ClientStateUpdated = BusEvent.define(
  "custom.client_state.updated",
  Schema.Struct({
    state: Schema.String,
    device_id: Schema.String,
    time_updated: Schema.Number,
  }),
)

export * as ClientStateDomain from "./domain"
