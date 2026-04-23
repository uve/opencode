/**
 * HTTP adapter for client UI state sync (custom fork).
 *
 * Mounted at `/custom/client-state`. Single isolated import in
 * `instance/index.ts` so upstream rebases stay one-line trivial.
 */
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { lazy } from "@/util/lazy"
import { errors } from "@/server/error"
import { ClientState, ClientStateInput } from "./domain"
import { get, put, Conflict } from "./service"

const NotFoundResponse = z.object({ found: z.literal(false) }).meta({ ref: "CustomClientStateMissing" })
const GetResponse = z
  .union([ClientState, NotFoundResponse])
  .meta({ ref: "CustomClientStateGetResponse" })

export const ClientStateRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get latest client UI state",
        description: "Read the current synced client UI blob. Returns {found:false} if no state has been written yet.",
        operationId: "custom.clientState.get",
        responses: {
          200: {
            description: "Latest client state",
            content: { "application/json": { schema: resolver(GetResponse) } },
          },
        },
      }),
      async (c) => {
        const row = await get()
        if (!row) return c.json({ found: false as const })
        return c.json(row)
      },
    )
    .put(
      "/",
      describeRoute({
        summary: "Write client UI state",
        description:
          "Persist the client UI blob and broadcast a `custom.client_state.updated` event so other connected tabs/devices can reconcile.",
        operationId: "custom.clientState.put",
        responses: {
          200: {
            description: "Persisted state",
            content: { "application/json": { schema: resolver(ClientState) } },
          },
          409: {
            description: "Optimistic concurrency conflict — caller's if_match is stale",
            content: {
              "application/json": {
                schema: resolver(z.object({ error: z.string(), current: ClientState })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ClientStateInput),
      async (c) => {
        const body = c.req.valid("json")
        try {
          const row = await put(body)
          return c.json(row)
        } catch (err) {
          if (err instanceof Conflict) return c.json({ error: "conflict", current: err.current }, 409)
          throw err
        }
      },
    ),
)

export * as ClientStateRoute from "./route"
