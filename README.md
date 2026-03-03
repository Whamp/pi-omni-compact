# pi-omni-compact

![pi-omni-compact banner](https://raw.githubusercontent.com/Whamp/pi-omni-compact/master/assets/banner.png)

[![npm version](https://img.shields.io/npm/v/pi-omni-compact)](https://www.npmjs.com/package/pi-omni-compact)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [pi](https://github.com/mariozechner/pi) extension that replaces default context compaction with a large-context model subprocess. Pi normally summarizes with the active conversation model. This extension spawns a separate pi instance using a large-context model that reads the entire conversation at once, producing higher-fidelity summaries.

## Installation

```bash
pi install npm:pi-omni-compact
```

Or from git:

```bash
pi install git:github.com/Whamp/pi-omni-compact
```

## Requirements

- [pi](https://github.com/mariozechner/pi) installed
- An API key for a large-context model configured in pi's model registry

## Configuration

Edit `settings.json` in the extension directory to configure which models to try. The extension uses the first model with a valid API key:

```json
{
  "models": [
    { "provider": "google-antigravity", "id": "gemini-3-flash", "thinking": "high" },
    { "provider": "google-antigravity", "id": "gemini-3-pro-low", "thinking": "high" }
  ],
  "debugCompactions": false,
  "minSummaryChars": 100
}
```

**You will need to update the `models` array** to match a provider and model available in your pi setup. A model with a 1M+ token context window is highly recommended — the whole point is reading the full conversation at once.

| Setting | Default | Description |
|---------|---------|-------------|
| `models` | See above | Ordered list of models to try. First with a valid API key wins. |
| `debugCompactions` | `false` | Save input/output JSON to `~/.pi/agent/extensions/pi-omni-compact/compactions/` for diagnosing bad summaries. |
| `minSummaryChars` | `100` | Minimum summary length. Shorter output triggers fallback to default compaction. |

API keys are resolved through pi's model registry — no separate key configuration needed.

### Optional: pi-read-map

If you have [pi-read-map](https://github.com/Whamp/pi-read-map) installed, the summarizer subprocess will use it automatically. It provides structural file maps so the summarizer can navigate the codebase faster and produce more accurate summaries.

## How it works

The extension hooks two pi events:

- **`session_before_compact`** — fires when the context window fills up and pi needs to summarize conversation history
- **`session_before_tree`** — fires when the user abandons a conversation branch and pi needs to preserve what happened

For both events, the extension:

1. Analyzes the full session for structural metadata — tool usage patterns, friction signals (error loops, rephrasing cascades), file operations, and session boundaries
2. Serializes the conversation and metadata into a hybrid text format
3. Resolves the first configured model with a valid API key
4. Spawns a pi subprocess with read-only tools (`read`, `grep`, `find`, `ls`) and pi-read-map if installed
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
npm run test:e2e   # end-to-end tests (requires real API key)
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
