# pi-omni-compact: E2E Testing Implementation Handoff

**Date:** 2026-02-09
**For:** Fresh session implementing e2e tests per `docs/plans/2026-02-09-e2e-testing-plan.md`

## Project Location

```
/home/will/projects/pi-omni-compact/
```

## What This Project Is

A pi extension that overrides session compaction and branch summarization by delegating to a large-context Gemini model (1M token context) spawned as a pi subprocess. When compaction triggers, the extension serializes the conversation, spawns `pi --mode json` with Gemini, parses the JSON event stream for the assistant's summary, and returns it to pi. On any failure, it returns `undefined` so pi falls back to its default compaction.

## What's Built and Passing

**Source files (6):**

| File | Purpose |
|------|---------|
| `src/settings.ts` | Loads `settings.json` from extension root. Model list: provider, id, thinking level |
| `src/models.ts` | `resolveModel()` — iterates configured models, returns first with valid API key via `ctx.modelRegistry` |
| `src/serializer.ts` | `serializeCompactionInput()` / `serializeBranchInput()` — converts preparation data to hybrid text with `<conversation>`, `<metadata>`, `<previous-summary>` tags |
| `src/prompts.ts` | Three system prompts: initial compaction, incremental compaction, branch summarization. All share an enhanced format template with sections like `## Goal`, `## Progress`, `## File Changes`, etc. |
| `src/subprocess.ts` | `runSummarizationAgent()` — writes temp files, spawns `pi --mode json -p --no-session`, parses JSON lines for `message_end` events, extracts assistant text, handles abort via signal, cleans up temp files |
| `src/index.ts` | Extension entry: registers `session_before_compact` and `session_before_tree` handlers |

**Test files (6, all passing):**

| File | Tests | Layer |
|------|-------|-------|
| `tests/unit/settings.test.ts` | 5 | Unit — loadSettings with valid/invalid/missing JSON |
| `tests/unit/models.test.ts` | 6 | Unit — resolveModel with various registry states |
| `tests/unit/serializer.test.ts` | 21 | Unit — serialization of compaction and branch inputs |
| `tests/unit/prompts.test.ts` | 20 | Unit — prompt section presence and distinctness |
| `tests/integration/extension-load.test.ts` | 6 | Integration — extension registers correct handlers |
| `tests/integration/handler-fallback.test.ts` | 4 | Integration — handlers return undefined when no model |

**Validation:** `npm run validate` passes (typecheck + lint + format). `npm test` passes (62 tests).

**E2E tests: 0 files, 0 tests.** This is the gap to fill.

## What You Need to Build

Read the full plan at `docs/plans/2026-02-09-e2e-testing-plan.md`. Summary:

### Tier 1: Subprocess Unit Tests (`tests/unit/subprocess.test.ts`)

The biggest untested module. Mock `child_process.spawn` to test:

- Temp file creation and cleanup (mkdtempSync, writeFileSync, unlinkSync, rmdirSync)
- Correct pi CLI args construction (--mode json, -p, --no-session, --provider, --model, --thinking, --tools, --system-prompt, -e for pi-read-map)
- API key passed via `PI_API_KEY` env var
- JSON event stream parsing: `message_end` events with assistant text extraction
- Handling split lines across data chunks
- Non-message_end events ignored
- Returns `undefined` on non-zero exit, abort, or empty output
- Temp file cleanup in finally block even on errors

### Tier 2: Live E2E Tests (`tests/e2e/`)

Spawn real pi with the extension, trigger compaction, verify output.

**Key discovery: `/compact` only works in interactive mode, not print mode.** In print mode, you need an extension command that calls `ctx.compact()`. The `trigger-compact.ts` example at `~/tools/pi-mono/packages/coding-agent/examples/extensions/trigger-compact.ts` shows this pattern — it registers `/trigger-compact` which calls `ctx.compact()`.

**Recommended approach for e2e:**

Option A: Write a small trigger extension (`tests/helpers/trigger-compact-ext.ts`) that registers a `/test-compact` command calling `ctx.compact()`. Load both extensions: our main extension + the trigger. Send a prompt, then call `/test-compact`.

Option B: Use a pre-built session file from the benchmark dataset. Copy `small-03-tmux-debug` (25k tokens, 100 lines) from `~/tools/pi-compression-benchmark/datasets/sessions/`. Load it as a session, then figure out how to trigger compaction. Problem: print mode `-p` sends one prompt and exits, so you can't send `/test-compact` after.

Option C: The trigger extension could compact on `turn_end` (like the example does), so you send one prompt and it auto-compacts.

**E2E test files to create:**

1. `tests/e2e/compaction.test.ts` — Verify enhanced summary format (sections, tags)
2. `tests/e2e/fallback.test.ts` — Bad model config, verify pi falls back to default

### Tier 3: Benchmark Integration (separate effort, not in this project)

Register `pi-omni-compact` as a strategy in `~/tools/pi-compression-benchmark/`. Not part of this implementation.

## Critical Implementation Details

### How pi routes compaction through the extension

```
session.compact() / auto-compact threshold
  → prepareCompaction(pathEntries, settings)
  → extensionRunner.emit({ type: "session_before_compact", preparation, branchEntries, signal })
  → if result?.compaction → use extension's summary
  → else → call internal compact() with the session model
  → sessionManager.appendCompaction(summary, firstKeptEntryId, tokensBefore)
```

The extension handler in `src/index.ts` returns either:
- `{ compaction: { summary, firstKeptEntryId, tokensBefore } }` — pi uses this
- `undefined` — pi falls through to default compaction

It never returns `{ cancel: true }`.

### How the subprocess works

```
runSummarizationAgent(input, systemPrompt, model, signal, cwd)
  1. mkdtempSync → /tmp/pi-omni-compact-XXXX/
  2. Write input.md and system-prompt.md (mode 0o600)
  3. Build args: --mode json -p --no-session --provider X --model Y --thinking Z --tools read,grep,find,ls --system-prompt /tmp/.../system-prompt.md
  4. If pi-read-map found at ~/.pi/agent/extensions/pi-read-map or ~/projects/pi-read-map → add -e flag
  5. Append: @/tmp/.../input.md "Produce an enhanced compaction summary..."
  6. spawn("pi", args, { cwd, env: { ...process.env, PI_API_KEY: apiKey } })
  7. Parse stdout line by line as JSON
  8. Look for { type: "message_end", message: { role: "assistant", content: [...] } }
  9. Extract text blocks, join with \n → finalText
  10. On signal.abort → SIGTERM, then SIGKILL after 5s
  11. finally → unlink temp files, rmdir temp dir
```

### JSON event format from pi --mode json

All events go to stdout as one JSON object per line. The event we care about:

```json
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"## Goal\n..."}]}}
```

Other events (message_start, content_delta, tool_start, tool_end, agent_end) are ignored.

### Settings and model config

`settings.json` at project root:
```json
{
  "models": [
    { "provider": "google-antigravity", "id": "gemini-3-flash", "thinking": "high" },
    { "provider": "google-antigravity", "id": "gemini-3-pro-low", "thinking": "high" }
  ]
}
```

Defaults (if settings.json missing): `google-antigravity/gemini-3-flash` (high thinking), `google-antigravity/gemini-3-pro-low` (high thinking).

### Enhanced format sections (what to assert)

Required in every compaction summary:
```
## Goal
## Progress
## Key Decisions
## Next Steps
```

Optional (model may omit if empty):
```
## Constraints & Preferences
## File Changes
## Code Patterns Established
## Open Questions
## Error History
## Critical Context
<read-files>
<modified-files>
```

### Lint rules to know about

The project uses oxlint with custom factory rules. Key disabled rules:
- `no-useless-undefined` — off (extension returns explicit `undefined` for clarity)
- `func-names` / `no-anonymous-default-export` — off (extension entry is `export default function`)
- `require-test-files` — off (not every source file needs a matching test)
- `types-file-organization` / `constants-file-organization` — off (small project, types inline)

Enforced rules that matter:
- `curly` — always use braces for if/for/while
- `Array<T>` → `T[]`
- `utf-8` → `utf8`
- Numeric separators: `100000` → `100_000`

Run `npm run validate` after changes.

## Reference Projects

### pi-read-map E2E pattern (`~/projects/pi-read-map/`)

The closest reference. Key files:

- `tests/helpers/pi-runner.ts` — `runPiSession()` spawns pi with extension, captures JSON output, parses tool results
- `tests/helpers/types.ts` — `PiSessionOptions`, `PiSessionResult`
- `tests/e2e/read-small-file.test.ts` — Example of structural assertions on tool output

Our runner needs to differ: we capture compaction entries and notifications, not tool results.

### pi-compression-benchmark (`~/tools/pi-compression-benchmark/`)

Has 14 curated sessions (JSONL files) in `datasets/sessions/` with manifest. The smallest is `small-03-tmux-debug` (25k tokens, 100 lines). These are real session files we could load for e2e testing.

Benchmark also has `scripts/run-compaction.mjs` showing how to programmatically trigger compaction on a session file using pi's SDK directly — could inspire an alternative approach.

### trigger-compact.ts example (`~/tools/pi-mono/packages/coding-agent/examples/extensions/trigger-compact.ts`)

Shows how to register an extension command that calls `ctx.compact()`. This is the key pattern for triggering compaction in print mode, since `/compact` is a builtin that only works in interactive mode.

## File Tree

```
pi-omni-compact/
├── docs/plans/
│   ├── 2026-02-09-e2e-testing-plan.md     ← The plan to implement
│   ├── 2026-02-09-implementation-handoff.md
│   └── 2026-02-09-omni-compact-design.md
├── settings.json
├── package.json
├── tsconfig.json
├── vitest.config.ts                        ← unit + integration
├── vitest.e2e.config.ts                    ← e2e (120s timeout)
├── .oxlintrc.json
├── .oxfmtrc.jsonc
├── src/
│   ├── index.ts
│   ├── models.ts
│   ├── prompts.ts
│   ├── serializer.ts
│   ├── settings.ts
│   └── subprocess.ts
└── tests/
    ├── helpers/
    │   ├── fixtures.ts                     ← Message/entry factories
    │   └── mocks.ts                        ← Mock pi/context/registry + invokeHandler()
    ├── integration/
    │   ├── extension-load.test.ts
    │   └── handler-fallback.test.ts
    ├── unit/
    │   ├── models.test.ts
    │   ├── prompts.test.ts
    │   ├── serializer.test.ts
    │   └── settings.test.ts
    └── e2e/                                ← EMPTY — build this
```

## Implementation Order

1. **`tests/unit/subprocess.test.ts`** — Mock spawn, test the full subprocess module. Biggest value, no network.
2. **`tests/helpers/pi-runner.ts`** — E2E runner that spawns pi, captures compaction output and notifications from JSON event stream.
3. **`tests/helpers/trigger-compact-ext.ts`** — Tiny extension that registers `/test-compact` calling `ctx.compact()` and triggers compaction on `turn_end` if session is large enough (or always, for testing).
4. **`tests/e2e/compaction.test.ts`** — Load extension + trigger, send prompt, verify enhanced summary sections.
5. **`tests/e2e/fallback.test.ts`** — Use bad settings.json, verify fallback to default compaction + warning notification.
6. Run `npm run validate` and `npm test` and `npm run test:e2e` — all must pass.

## Commands

```bash
cd /home/will/projects/pi-omni-compact
npm run validate          # typecheck + lint + format (must pass)
npm test                  # unit + integration (62 tests, must pass)
npm run test:e2e          # e2e tests (currently 0, will be slow + cost tokens)
npm run format            # auto-fix formatting
npm run lint:fix          # auto-fix lint
```

## Open Questions to Resolve During Implementation

1. **How to trigger compaction in print mode.** `/compact` is a builtin that only works in interactive mode (handled in `interactive-mode.ts` line 1927). In print mode, you need an extension command calling `ctx.compact()`. The trigger extension approach is recommended but needs validation. Alternative: use `ctx.compact()` from a `turn_end` handler.

2. **How to build enough context for compaction.** `prepareCompaction()` requires enough tokens. Options: (a) copy a real session file from the benchmark dataset, (b) send a very long prompt, (c) have the trigger extension call `ctx.compact()` with force (if that's supported). Check if `ctx.compact()` has a force option or if `prepareCompaction` rejects small sessions.

3. **How to capture the compaction summary from JSON output.** In `--mode json`, pi emits all events via `console.log(JSON.stringify(event))`. After compaction, there should be an `auto_compaction_end` event with `result: { summary, firstKeptEntryId, tokensBefore }`. Parse that from stdout. Also look for notification events if those are emitted in JSON mode.

4. **Whether notifications appear in JSON mode output.** Extensions call `ctx.ui.notify()` but in print mode `ctx.hasUI` is false (no UI). The notify call may be a no-op. If so, fallback tests need a different assertion strategy — maybe check stderr or the compaction result itself.
