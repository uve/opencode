---
name: deep-research
description: Use Google Gemini Deep Research Agent for comprehensive web research
---

# Deep Research with Google Gemini

The `deep_research` tool uses the official Google Deep Research Agent (`deep-research-pro-preview-12-2025`) via the Interactions API. Powered by Gemini 3.1 Pro internally.

The agent autonomously:

1. Plans research queries
2. Searches and reads 20-30+ web sources in parallel
3. Cross-references findings across multiple independent sources
4. Iterates with additional searches as needed
5. Synthesizes findings into a detailed, cited research report (2000+ words)

**Characteristics:**

- Takes 5-20 minutes (runs asynchronously with polling, max 25 min timeout)
- Costs ~$2-5 per task
- Produces comprehensive reports with citations
- No other models involved — only `deep-research-pro-preview-12-2025`

## When to Use

Proactively suggest using this tool when:

- User asks for "deep research", "глубокий поиск", or "найди информацию"
- User needs current/fresh information that may not be in your training data
- Looking for best practices, patterns, or recommended approaches for unfamiliar technology
- Researching APIs, libraries, or technologies you're unsure about
- User asks "how to do X" for something complex where web research would help
- Need to find similar solutions or implementations to reference
- Need to verify if a library/API is still maintained or has breaking changes

## How to Use

Call the `deep_research` tool with:

- `query` (required): A clear, specific research question
- `context` (optional): What the user is working on — helps focus the research

## Prompt Engineering

The tool automatically wraps your query in a structured research plan to force the Deep Research Agent into full multi-step mode (bypassing its internal intent classifier that may otherwise downgrade simple queries to shallow search):

- Explicitly requests 20-30+ sources
- Demands cross-referencing and comparative analysis
- Specifies a detailed output format with 8 sections

**Best practices for queries:**

- Be specific and multi-faceted: "Compare OAuth2 PKCE vs BFF pattern for SPAs — security tradeoffs, implementation complexity, browser support, and real-world adoption in 2026"
- Ask for analysis, not just facts: "Analyze the current state of..." rather than "What is X?"
- Include multiple dimensions to investigate: performance, security, DX, ecosystem support, etc.

## Tips

- Be specific in the query: "How to implement OAuth2 PKCE flow in TypeScript with Express" > "OAuth implementation"
- Always include context when available — it dramatically improves relevance
- Results include citations — reference them when sharing findings

## Interaction Pattern

When the user describes a complex task or asks about unfamiliar technology:

> "Хотите, я сделаю глубокий поиск по этой теме через Gemini Deep Research? Это займёт 5-20 минут и стоит ~$2-5, но даст подробный отчёт с источниками."

## Setup

Requires `GEMINI_API_KEY` environment variable. Get a key at https://aistudio.google.com/apikey
