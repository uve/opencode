import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { ProviderID, ModelID } from "../../provider/schema"
import { ToolRegistry } from "../../tool/registry"
import { Worktree } from "../../worktree"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { MCP } from "../../mcp"
import { Session } from "../../session"
import { toJSONSchema } from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { WorkspaceRoutes } from "./workspace"

export const ExperimentalRoutes = lazy(() =>
  new Hono()
    .get(
      "/tool/ids",
      describeRoute({
        summary: "List tool IDs",
        description:
          "Get a list of all available tool IDs, including both built-in tools and dynamically registered tools.",
        operationId: "tool.ids",
        responses: {
          200: {
            description: "Tool IDs",
            content: {
              "application/json": {
                schema: resolver(z.array(z.string()).meta({ ref: "ToolIDs" })),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        return c.json(await ToolRegistry.ids())
      },
    )
    .get(
      "/tool",
      describeRoute({
        summary: "List tools",
        description:
          "Get a list of available tools with their JSON schema parameters for a specific provider and model combination.",
        operationId: "tool.list",
        responses: {
          200: {
            description: "Tools",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .array(
                      z
                        .object({
                          id: z.string(),
                          description: z.string(),
                          parameters: z.any(),
                        })
                        .meta({ ref: "ToolListItem" }),
                    )
                    .meta({ ref: "ToolList" }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          provider: z.string(),
          model: z.string(),
        }),
      ),
      async (c) => {
        const { provider, model } = c.req.valid("query")
        const tools = await ToolRegistry.tools({ providerID: ProviderID.make(provider), modelID: ModelID.make(model) })
        return c.json(
          tools.map((t) => {
            const raw = (t.parameters as any)?._def ? toJSONSchema(t.parameters as any) : t.parameters
            // Strip $schema and additionalProperties — OpenAI rejects them
            const { $schema, additionalProperties, ...params } = raw as Record<string, any>
            return { id: t.id, description: t.description, parameters: params }
          }),
        )
      },
    )
    .route("/workspace", WorkspaceRoutes())
    .post(
      "/worktree",
      describeRoute({
        summary: "Create worktree",
        description: "Create a new git worktree for the current project and run any configured startup scripts.",
        operationId: "worktree.create",
        responses: {
          200: {
            description: "Worktree created",
            content: {
              "application/json": {
                schema: resolver(Worktree.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Worktree.CreateInput.optional()),
      async (c) => {
        const body = c.req.valid("json")
        const worktree = await Worktree.create(body)
        return c.json(worktree)
      },
    )
    .get(
      "/worktree",
      describeRoute({
        summary: "List worktrees",
        description: "List all sandbox worktrees for the current project.",
        operationId: "worktree.list",
        responses: {
          200: {
            description: "List of worktree directories",
            content: {
              "application/json": {
                schema: resolver(z.array(z.string())),
              },
            },
          },
        },
      }),
      async (c) => {
        const sandboxes = await Project.sandboxes(Instance.project.id)
        return c.json(sandboxes)
      },
    )
    .delete(
      "/worktree",
      describeRoute({
        summary: "Remove worktree",
        description: "Remove a git worktree and delete its branch.",
        operationId: "worktree.remove",
        responses: {
          200: {
            description: "Worktree removed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Worktree.RemoveInput),
      async (c) => {
        const body = c.req.valid("json")
        await Worktree.remove(body)
        await Project.removeSandbox(Instance.project.id, body.directory)
        return c.json(true)
      },
    )
    .post(
      "/worktree/reset",
      describeRoute({
        summary: "Reset worktree",
        description: "Reset a worktree branch to the primary default branch.",
        operationId: "worktree.reset",
        responses: {
          200: {
            description: "Worktree reset",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Worktree.ResetInput),
      async (c) => {
        const body = c.req.valid("json")
        await Worktree.reset(body)
        return c.json(true)
      },
    )
    .get(
      "/session",
      describeRoute({
        summary: "List sessions",
        description:
          "Get a list of all OpenCode sessions across projects, sorted by most recently updated. Archived sessions are excluded by default.",
        operationId: "experimental.session.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Session.GlobalInfo.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter sessions by project directory" }),
          roots: z.coerce.boolean().optional().meta({ description: "Only return root sessions (no parentID)" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
          cursor: z.coerce
            .number()
            .optional()
            .meta({ description: "Return sessions updated before this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
          archived: z.coerce.boolean().optional().meta({ description: "Include archived sessions (default false)" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const limit = query.limit ?? 100
        const sessions: Session.GlobalInfo[] = []
        for await (const session of Session.listGlobal({
          directory: query.directory,
          roots: query.roots,
          start: query.start,
          cursor: query.cursor,
          search: query.search,
          limit: limit + 1,
          archived: query.archived,
        })) {
          sessions.push(session)
        }
        const hasMore = sessions.length > limit
        const list = hasMore ? sessions.slice(0, limit) : sessions
        if (hasMore && list.length > 0) {
          c.header("x-next-cursor", String(list[list.length - 1].time.updated))
        }
        return c.json(list)
      },
    )
    .get(
      "/resource",
      describeRoute({
        summary: "Get MCP resources",
        description: "Get all available MCP resources from connected servers. Optionally filter by name.",
        operationId: "experimental.resource.list",
        responses: {
          200: {
            description: "MCP resources",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Resource)),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await MCP.resources())
      },
    )
    .post(
      "/transcribe",
      describeRoute({
        summary: "Transcribe audio",
        description: "Proxy audio transcription to OpenAI Whisper/GPT-4o-transcribe API.",
        operationId: "experimental.transcribe",
        responses: {
          200: {
            description: "Transcription result",
            content: {
              "application/json": {
                schema: resolver(z.object({ text: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const apiKey = process.env.OPENAI_AUDIO_API_KEY
        if (!apiKey) {
          return c.json({ error: "OPENAI_AUDIO_API_KEY not set" }, 400)
        }
        const body = await c.req.formData()
        const file = body.get("file")
        const model = body.get("model") || "gpt-4o-transcribe"
        if (!file || !(file instanceof File)) {
          return c.json({ error: "file is required" }, 400)
        }
        const form = new FormData()
        form.append("file", file, file.name)
        form.append("model", String(model))
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        })
        if (!res.ok) {
          const text = await res.text()
          return c.json({ error: text }, res.status as any)
        }
        const data = (await res.json()) as { text: string }
        return c.json({ text: data.text })
      },
    )
    .post(
      "/tts",
      describeRoute({
        summary: "Text to speech",
        description:
          "Proxy text-to-speech to OpenAI or ElevenLabs TTS API. Set TTS_ENGINE=elevenlabs and ELEVENLABS_API_KEY to use ElevenLabs. Defaults to OpenAI.",
        operationId: "experimental.tts",
        responses: {
          200: {
            description: "Audio stream",
            content: {
              "audio/mpeg": {
                schema: resolver(z.any()),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const body = (await c.req.json()) as { text?: string; voice?: string; model?: string }
        if (!body.text?.trim()) {
          return c.json({ error: "text is required" }, 400)
        }

        const engine = (process.env.TTS_ENGINE || "openai").toLowerCase()

        // ── ElevenLabs ──
        if (engine === "elevenlabs") {
          const apiKey = process.env.ELEVENLABS_API_KEY
          if (!apiKey) {
            return c.json({ error: "ELEVENLABS_API_KEY not set" }, 400)
          }
          const voice = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"
          const model = body.model || "eleven_multilingual_v2"
          const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: body.text.slice(0, 5000),
              model_id: model,
            }),
          })
          if (!res.ok) {
            const text = await res.text()
            return c.json({ error: text }, res.status as any)
          }
          c.header("Content-Type", "audio/mpeg")
          return c.body(res.body as any)
        }

        // ── OpenAI (default) ──
        const apiKey = process.env.OPENAI_AUDIO_API_KEY
        if (!apiKey) {
          return c.json({ error: "OPENAI_AUDIO_API_KEY not set" }, 400)
        }
        const res = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: body.model || "gpt-4o-mini-tts",
            voice: body.voice || "nova",
            input: body.text.slice(0, 4096),
            response_format: "mp3",
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          return c.json({ error: text }, res.status as any)
        }
        c.header("Content-Type", "audio/mpeg")
        return c.body(res.body as any)
      },
    )
    .post(
      "/realtime/session",
      describeRoute({
        summary: "Create OpenAI Realtime ephemeral session",
        description:
          "Mint an ephemeral client token for the browser to open a WebRTC connection to OpenAI Realtime API.",
        operationId: "experimental.realtime.session",
        responses: {
          200: {
            description: "Ephemeral session",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const key = process.env.OPENAI_REALTIME_API_KEY || process.env.OPENAI_AUDIO_API_KEY
        if (!key) {
          return c.json({ error: "OPENAI_REALTIME_API_KEY not set" }, 400)
        }
        const body = (await c.req.json().catch(() => ({}))) as {
          model?: string
          language?: string
        }
        const res = await fetch("https://api.openai.com/v1/realtime/transcription_sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input_audio_format: "pcm16",
            input_audio_transcription: {
              model: body.model || "gpt-4o-transcribe",
              language: body.language,
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              silence_duration_ms: 600,
            },
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          return c.json({ error: text }, res.status as any)
        }
        return c.json(await res.json())
      },
    ),
)
