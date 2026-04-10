/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"

const BASE = "https://generativelanguage.googleapis.com/v1beta"
const AGENT = "deep-research-pro-preview-12-2025"
const POLL = 10_000
const MAX = 1_500_000

interface Output {
  type?: string
  text?: string
}

interface Interaction {
  id?: string
  name?: string
  status?: string
  outputs?: Output[]
  error?: { message?: string; code?: number }
}

function headers(key: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-goog-api-key": key }
}

async function poll(id: string, key: string): Promise<Interaction | null> {
  let delay = 2000
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/interactions/${id}`, {
      headers: { "x-goog-api-key": key },
    })
    if (res.ok) return res.json()
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
      continue
    }
    const err = await res.text()
    throw new Error(`Polling error ${res.status}: ${err}`)
  }
  return null
}

function plan(query: string, ctx: string): string {
  const parts = [
    "Conduct a comprehensive, multi-step deep research investigation on the following topic.",
    "This requires searching and reading AT LEAST 20-30 different web sources, cross-referencing findings, and producing a thorough research report.",
    "",
    "## Research Requirements",
    "- Search from multiple angles: official docs, academic papers, blog posts, GitHub repos, forums, news articles",
    "- Read and analyze each source in depth — do not just skim titles",
    "- Cross-reference claims across multiple independent sources",
    "- Identify contradictions, gaps, and areas of consensus",
    "- Include specific data points, code examples, version numbers, and dates where relevant",
    "- Cover historical context, current state, and future outlook",
    "",
  ]
  if (ctx) {
    parts.push("## Context", ctx, "")
  }
  parts.push(
    "## Research Topic",
    query,
    "",
    "## Required Output Format",
    "Produce a detailed research report (2000+ words) structured as follows:",
    "1. Executive Summary (key findings in 3-5 bullet points)",
    "2. Background & Context",
    "3. Detailed Findings (organized by theme, with citations)",
    "4. Comparative Analysis (if applicable)",
    "5. Best Practices & Recommendations",
    "6. Potential Risks & Limitations",
    "7. Conclusion",
    "8. Complete list of all sources consulted with URLs",
  )
  return parts.join("\n")
}

async function research(query: string, ctx: string, key: string): Promise<string> {
  const input = plan(query, ctx)

  const res = await fetch(`${BASE}/interactions`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      agent: AGENT,
      input,
      background: true,
      store: true,
      agent_config: {
        type: "deep-research",
        thinking_summaries: "auto",
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Interactions API error ${res.status}: ${err}`)
  }

  const created: Interaction = await res.json()
  const id = created.id
  if (!id) throw new Error("No interaction ID returned")

  const start = Date.now()
  while (Date.now() - start < MAX) {
    await new Promise((r) => setTimeout(r, POLL))

    const state = await poll(id, key)
    if (!state) continue

    const status = (state.status ?? "").toLowerCase()

    if (status === "completed") {
      if (!state.outputs?.length) return "Research completed but no output was returned."
      const last = state.outputs[state.outputs.length - 1]
      return last.text ?? "Research completed but output had no text."
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(`Research ${status}: ${state.error?.message ?? "unknown error"}`)
    }
  }

  throw new Error("Research timed out after 25 minutes. Try a more specific query.")
}

export default tool({
  description: `Conduct deep research using Google Gemini Deep Research Agent (deep-research-pro-preview-12-2025).

Uses the official Google Deep Research Agent via the Interactions API. The agent autonomously plans, searches 20-30+ web sources, reads and analyzes them in depth, cross-references findings, and produces a comprehensive cited report. Powered by Gemini 3.1 Pro internally.

Use this tool when you need to:
- Find fresh, up-to-date information on any topic
- Research best practices and recommended approaches
- Find similar solutions, implementations, or code examples
- Gather comprehensive context before solving a complex task
- Verify current state of APIs, libraries, or technologies

Takes 5-20 minutes. Costs ~$2-5 per task.

Requires GEMINI_API_KEY environment variable.`,
  args: {
    query: tool.schema.string().describe("The research question or topic to investigate"),
    context: tool.schema
      .string()
      .describe("Optional context about what you're working on to focus the research")
      .default(""),
  },
  async execute(args) {
    const key = process.env.GEMINI_API_KEY
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. Get your key at https://aistudio.google.com/apikey",
      )
    }

    return research(args.query, args.context, key)
  },
})
