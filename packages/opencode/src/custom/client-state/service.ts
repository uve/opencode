/**
 * Application service for client UI state sync (custom fork).
 *
 * Use cases:
 *  - get(): read latest state
 *  - put(input): conflict-checked write + Bus broadcast for live sync
 *
 * Conflict policy: optimistic concurrency via if_match (client's last-known
 * time_updated). Caller treats `Conflict` as "refetch and replay merge".
 * Last-write-wins when if_match is omitted.
 */
import { Bus } from "@/bus"
import { ClientStateUpdated, type ClientState, type ClientStateInput } from "./domain"
import { read, write } from "./repository"

export class Conflict extends Error {
  readonly _tag = "ClientStateConflict"
  constructor(public current: ClientState) {
    super(`client_state conflict: server time_updated=${current.time_updated}`)
  }
}

export async function get(): Promise<ClientState | undefined> {
  return read()
}

export async function put(input: ClientStateInput): Promise<ClientState> {
  if (input.if_match !== undefined) {
    const current = read()
    if (current && current.time_updated > input.if_match) throw new Conflict(current)
  }
  const row = write({ state: input.state, device_id: input.device_id })
  await Bus.publish(ClientStateUpdated, {
    state: row.state,
    device_id: row.device_id,
    time_updated: row.time_updated,
  })
  return row
}

export * as ClientStateService from "./service"
