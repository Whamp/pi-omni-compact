# pi-omni-compact

![pi-omni-compact banner](assets/banner.png)

A [pi](https://github.com/mariozechner/pi) extension that replaces default context compaction with a large-context model subprocess. Pi normally summarizes with the active conversation model. This extension spawns a separate pi instance using a 1M-token Gemini model that reads the entire conversation at once, producing higher-fidelity summaries.

## Requirements

- [pi](https://github.com/mariozechner/pi) installed
- A Gemini API key configured in pi's model registry
- Node.js

## How it works

The extension hooks two pi events:

- **`session_before_compact`** — fires when the context window fills up and pi needs to summarize conversation history
- **`session_before_tree`** — fires when the user abandons a conversation branch and pi needs to preserve what happened

For both events, the extension:

1. Analyzes the full session for structural metadata — tool usage patterns, friction signals (error loops, rephrasing cascades), file operations, and session boundaries
2. Serializes the conversation and metadata into a hybrid text format
3. Resolves the first configured model with a valid API key
4. Spawns a pi subprocess with read-only tools (`read`, `grep`, `find`, `ls`) and an optional [pi-read-map](https://github.com/Whamp/pi-read-map) extension (provides structural file maps so the summarizer can navigate the codebase faster)
5. The subprocess reads the conversation and referenced source files, then returns a structured summary

On any failure — no API key, subprocess crash, output too short — the extension returns `undefined` and pi falls back to its default compaction.

## Summary format

The output follows a fixed structure:

- **Goal** — the original user request, quoted verbatim
- **Constraints & Preferences** — requirements and style decisions
- **Progress** — done, in progress, blocked
- **Key Decisions** — what was decided, why, and alternatives rejected
- **File Changes** — paths and what changed
- **Code Patterns Established** — conventions and architectural choices the codebase follows
- **Implicit Dependencies** — environment variables, config, non-obvious coupling
- **Open Questions** — deferred decisions, unresolved issues
- **Error History** — errors encountered and fixes applied
- **Remaining Work** — unfinished tasks
- **Next Steps** — ordered list of recommended actions
- **Critical Context** — specific values, references, and data needed to continue

## Installation

```bash
pi install https://github.com/Whamp/pi-omni-compact
```

Or manually:

```bash
git clone https://github.com/Whamp/pi-omni-compact ~/.pi/agent/extensions/pi-omni-compact
cd ~/.pi/agent/extensions/pi-omni-compact
npm install
```

## Configuration

Edit `settings.json` in the extension directory to configure which models to try. The extension uses the first model that has a valid API key:

```json
{
  "models": [
    { "provider": "google-gemini-cli", "id": "gemini-3-flash-preview", "thinking": "high" },
    { "provider": "google-gemini-cli", "id": "gemini-3-pro-preview", "thinking": "high" }
  ],
  "debugCompactions": false,
  "minSummaryChars": 100
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `models` | Gemini 3 Flash, Gemini 3 Pro | Ordered list of models to try. First with a valid API key wins. |
| `debugCompactions` | `false` | Save input/output JSON to `~/.pi/agent/extensions/pi-omni-compact/compactions/` for diagnosing bad summaries. |
| `minSummaryChars` | `100` | Minimum summary length. Shorter output triggers fallback to default compaction. |

API keys are resolved through pi's model registry — no separate key configuration needed.

## Benchmark results

Evaluated against 14 real coding sessions (25k–165k tokens) using [pi-compression-benchmark](https://github.com/Whamp/pi-compression-benchmark) with probe-response scoring:

| Strategy | Avg Score | Min | Max |
|----------|-----------|-----|-----|
| **pi-omni-compact** | **57.1** | 35 | 89 |
| pi-agentic-compaction | 46.2 | 30 | 70 |
| pi-default | 46.1 | 20 | 85 |

Strongest on sessions with concrete implementation work. Weakest on pure exploration/research sessions with no clear goal structure.

## Development

```bash
npm run validate   # typecheck + lint + format check
npm test           # unit + integration tests
npm run test:e2e   # end-to-end tests (requires real Gemini API key)
npm run build      # compile to dist/
```

## Architecture

```
src/
  index.ts              Event handlers for session_before_compact, session_before_tree
  models.ts             Resolve first configured model with valid API key
  serializer.ts         Convert pi messages to LLM input format
  session-analysis.ts   Extract structural metadata (friction, boundaries, file ops)
  prompts.ts            System prompts (initial, incremental, branch)
  subprocess.ts         Spawn pi subprocess, parse JSON event stream
  settings.ts           Load and validate settings.json
  debug.ts              Save compaction input/output as debug artifacts
```

## License

MIT
