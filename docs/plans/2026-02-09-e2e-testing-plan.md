# pi-omni-compact E2E Testing Plan

**Date:** 2026-02-09
**Status:** Draft

## Current State

The validation loop has three layers, and the bottom is empty:

| Layer | Tests | Coverage |
|-------|-------|---------|
| Unit | 52 | `settings`, `models`, `serializer`, `prompts` — pure function logic |
| Integration | 10 | Extension registration, handler fallback when no model resolves |
| **E2E** | **0** | **Nothing** |

Everything above the subprocess boundary is tested. Nothing below it is — no test spawns pi, triggers compaction, or verifies the output format. The subprocess module (`src/subprocess.ts`) is untested at every level.

## What E2E Tests Must Prove

1. **The extension loads and intercepts compaction.** Pi spawns, the extension registers its handlers, `/compact` routes through `session_before_compact` instead of the default path.
2. **The subprocess spawns, calls the model, and returns structured output.** The pi subprocess runs in `--mode json`, sends the serialized conversation to the configured Gemini model, and the response is parsed back into a summary string.
3. **The output format matches the enhanced template.** The summary contains the required sections (`## Goal`, `## Progress`, `## Key Decisions`, `## File Changes`, `## Next Steps`, `<read-files>`, `<modified-files>`).
4. **Fallback works.** When no model resolves (bad config, no API key), the extension returns `undefined` and pi falls through to its default compaction. A notification is emitted.
5. **Abort propagation works.** When the parent signal aborts, the subprocess is killed and the extension returns `undefined` without throwing.
6. **Incremental compaction works.** When `previousSummary` is present, the incremental prompt is selected and the existing summary is preserved/merged.
7. **Branch summarization works.** The `session_before_tree` handler produces a branch summary in the enhanced format when a branch is abandoned.

## Architecture

### How the extension works end-to-end

```
pi session (user types messages)
  → context fills up / user types /compact
  → pi emits session_before_compact(preparation, signal)
  → pi-omni-compact handler:
      1. loadSettings() → model config
      2. resolveModel(ctx.modelRegistry, models) → provider/model/apiKey
      3. serializeCompactionInput(preparation) → text
      4. pick system prompt (initial vs incremental)
      5. runSummarizationAgent(text, prompt, model, signal, cwd)
          → writes temp files
          → spawns `pi --mode json -p --no-session --provider X --model Y ...`
          → parses JSON event stream for message_end events
          → extracts assistant text content
          → cleans up temp files
      6. returns { compaction: { summary, firstKeptEntryId, tokensBefore } }
  → pi persists the compaction entry
```

### What makes this hard to e2e test

- **Real model calls cost money and are slow.** A Gemini Flash call on a serialized session takes 10–30 seconds and consumes tokens.
- **The subprocess spawns pi itself.** The extension runs inside pi, and then spawns a second pi instance. Testing requires pi to be installed and authenticated.
- **Session state is required.** Compaction only triggers when there are enough tokens in the context. We need to either build up a real session or manufacture one.
- **The output is nondeterministic.** LLM output varies per call. We can only assert structural properties (section headings, tag presence), not exact content.

## Test Strategy

### Three tiers of e2e tests

#### Tier 1: Subprocess Unit Tests (no real model)
**Location:** `tests/unit/subprocess.test.ts`
**Runs in:** `npm test` (fast, no network)

Mock `child_process.spawn` to simulate the pi subprocess. Test:

| Test | What |
|------|------|
| `writes temp files and cleans up` | Verify `mkdtempSync`, `writeFileSync`, `unlinkSync`, `rmdirSync` calls |
| `builds correct pi args` | Verify the spawned command includes `--mode json`, `-p`, `--no-session`, `--provider`, `--model`, `--thinking`, `--tools`, `--system-prompt`, `-e` (if pi-read-map found) |
| `passes API key via env` | Verify `env.PI_API_KEY` is set |
| `parses message_end event` | Feed a `message_end` JSON line to stdout, verify text extraction |
| `ignores non-message_end events` | Feed `message_start`, `content_delta`, etc. — verify they don't set finalText |
| `handles split lines across chunks` | Feed a JSON line split across two `data` events |
| `returns undefined on non-zero exit` | Simulate exit code 1 |
| `returns undefined on abort` | Abort the signal before/during execution, verify SIGTERM sent |
| `returns undefined on empty output` | Process exits 0 but no `message_end` emitted |
| `cleans up temp files on error` | Simulate spawn error, verify finally block runs |

This tier covers the subprocess module without network calls. It's the most important gap in our current test suite.

#### Tier 2: Live Extension Tests (real pi, real model)
**Location:** `tests/e2e/compaction.test.ts`, `tests/e2e/fallback.test.ts`
**Runs in:** `npm run test:e2e` (slow, requires auth, costs tokens)
**Timeout:** 120s per test

These spawn a real pi session with the extension loaded and a real model.

##### `tests/e2e/compaction.test.ts`

**Setup:** Create a temp directory with a small file. Spawn pi with our extension, send a multi-turn prompt that generates enough context to compact.

| Test | What | Timeout |
|------|------|---------|
| `produces enhanced summary format` | Send 3–4 messages, trigger `/compact`, verify the compaction entry contains `## Goal`, `## Progress`, `## Next Steps` | 90s |
| `includes file tracking tags` | Same as above, but verify `<read-files>` and `<modified-files>` tags appear | 90s |
| `uses configured model` | Verify the notification says `omni-compact: summarizing with google-antigravity/gemini-3-flash` | 90s |

**Implementation approach:** Use `runPiSession()` helper (adapted from pi-read-map). The challenge is triggering compaction from a prompt-mode session. Two options:

1. **Option A: Use a session file.** Copy a session `.jsonl` from the benchmark dataset, load it with `--session`, then send `/compact`. This guarantees enough tokens.
2. **Option B: Programmatic.** Use the extension API `trigger-compact.ts` pattern — register a `/test-compact` command that calls `ctx.compact()` directly with manufactured preparation data.

Option A is simpler and tests the real path. Use the smallest benchmark session (`small-03-tmux-debug`, 25k tokens, 100 lines JSONL).

##### `tests/e2e/fallback.test.ts`

| Test | What | Timeout |
|------|------|---------|
| `falls back when model unavailable` | Load extension with a `settings.json` pointing to nonexistent model `fake-provider/fake-model`, trigger compaction, verify pi still produces a compaction (default) and a warning notification was emitted | 90s |
| `falls back when subprocess fails` | Load extension with valid model but broken `--system-prompt` path (tamper with temp file), verify fallback | 90s |

##### `tests/e2e/branch-summary.test.ts` (stretch)

Branch summarization is harder to trigger in a scripted session. Requires creating a branch, making changes, then switching away. May defer to manual testing.

#### Tier 3: Benchmark Integration (separate project, post-e2e)
**Location:** `~/tools/pi-compression-benchmark/`
**Not part of pi-omni-compact's test suite.**

Register `pi-omni-compact` as a third compression strategy in the benchmark. This is quality evaluation, not pass/fail testing.

| Step | What |
|------|------|
| Add `pi-omni-compact` strategy type | Add to `CompressionStrategyType` union |
| Write runner | `scripts/compaction-runners/pi-omni-compact.mjs` — spawns pi with our extension, triggers compaction on a session file, captures the compaction entry |
| Run on 3 small sessions | `small-03-tmux-debug`, `small-02-extension-docs`, `small-01-vacation-webapp` |
| Compare scores | Against `pi-default` (39.2 avg) and `pi-agentic-compaction` (39.0 avg) |
| Run full 14-session suite | If small session results are promising |

This produces quantitative quality data: probe-response scores on accuracy, completeness, confidence, specificity.

## Test Helpers

### `tests/helpers/pi-runner.ts`

Adapted from pi-read-map's runner. Key differences:

- **No tool results to capture.** We're testing compaction output, not tool call results.
- **Need to capture compaction entries.** Parse the JSON event stream for compaction-related events or session entries appended after `/compact`.
- **Need notification capture.** Parse JSON events for notification messages (to verify fallback warnings).
- **Session file support.** Accept a `--session <path>` flag to load existing sessions.

```typescript
interface CompactionSessionResult {
  rawOutput: string;
  stderr: string;
  exitCode: number;
  compactionSummary: string | null;
  notifications: { message: string; level: string }[];
}
```

### `tests/helpers/session-factory.ts`

Build minimal session `.jsonl` files programmatically:

```typescript
function createMinimalSession(options: {
  messageCount: number;
  includeToolCalls: boolean;
  cwd: string;
}): string; // Returns path to temp .jsonl file
```

Or just copy from the benchmark dataset — simpler and more realistic.

## File Layout

```
tests/
├── e2e/
│   ├── compaction.test.ts        # Tier 2: live compaction with real model
│   ├── fallback.test.ts          # Tier 2: fallback when model unavailable
│   └── branch-summary.test.ts    # Tier 2: stretch goal
├── helpers/
│   ├── fixtures.ts               # Existing: message/entry factories
│   ├── mocks.ts                  # Existing: mock pi/context/registry
│   ├── pi-runner.ts              # New: spawn pi, capture compaction output
│   └── session-factory.ts        # New: build/copy session files
├── integration/
│   ├── extension-load.test.ts    # Existing
│   └── handler-fallback.test.ts  # Existing
└── unit/
    ├── models.test.ts            # Existing
    ├── prompts.test.ts           # Existing
    ├── serializer.test.ts        # Existing
    ├── settings.test.ts          # Existing
    └── subprocess.test.ts        # New: Tier 1 — mocked spawn
```

## Implementation Order

1. **`tests/unit/subprocess.test.ts`** — Fill the biggest gap. Mock `spawn`, test JSON parsing, abort, cleanup. No network. Runs in `npm test`.
2. **`tests/helpers/pi-runner.ts`** — Build the e2e session runner. Adapt from pi-read-map.
3. **`tests/helpers/session-factory.ts`** — Copy smallest benchmark session, or build synthetic ones.
4. **`tests/e2e/compaction.test.ts`** — The core e2e: load extension, trigger compaction, verify enhanced format.
5. **`tests/e2e/fallback.test.ts`** — Bad config, verify fallback.
6. **Benchmark integration** — Separate effort in `~/tools/pi-compression-benchmark/`.

## Model and Cost

E2e tests use real models. Budget per full `npm run test:e2e`:

| Test | Model | Estimated Input | Estimated Cost |
|------|-------|-----------------|---------------|
| compaction-basic (3 tests) | gemini-3-flash | ~30k tokens × 3 | ~$0.03 |
| fallback (2 tests) | none (fails before model call) | 0 | $0.00 |

Total per run: ~$0.03. Acceptable for CI.

**Model for e2e tests:** Use `gemini-3-flash` via `google-antigravity` provider. Fast, cheap, 1M context.

## Assertions

### Structural assertions for enhanced format

The compaction summary must contain these markers. We assert presence, not exact content:

```typescript
const REQUIRED_SECTIONS = [
  "## Goal",
  "## Progress",
  "## Key Decisions",
  "## Next Steps",
];

const OPTIONAL_SECTIONS = [
  "## Constraints & Preferences",
  "## File Changes",
  "## Code Patterns Established",
  "## Open Questions",
  "## Error History",
  "## Critical Context",
];

const FILE_TRACKING_TAGS = [
  "<read-files>",
  "<modified-files>",
];
```

A compaction passes if it contains all `REQUIRED_SECTIONS` and at least one of the `FILE_TRACKING_TAGS`. We don't require all optional sections — the model may omit empty ones.

### Fallback assertions

```typescript
// Compaction still happened (pi default)
expect(result.compactionSummary).not.toBeNull();
// But it came from default, not our extension
// Verify via notification
expect(result.notifications).toContainEqual(
  expect.objectContaining({ message: expect.stringContaining("no configured model") })
);
```

## Open Questions

1. **How to trigger `/compact` programmatically in prompt mode?** The `-p` flag runs a single prompt. We may need to use `--mode json` with stdin piped, sending `/compact` as a second message. Or we could use the session file approach with a pre-built session that's already at compaction threshold.

2. **Can we capture the compaction entry from JSON mode output?** Need to verify what events pi emits during compaction in `--mode json`. It may emit the compaction entry as a session event, or we may need to read the session file after.

3. **Should subprocess tests live in unit or integration?** They mock `spawn` (unit behavior) but test the full subprocess orchestration logic (integration behavior). Placing in `unit/` is pragmatic — they run fast and don't need network.

4. **Branch summary triggering.** There's no `/branch-summary` command. Branch summaries happen when the user navigates away from a branch with unsaved work. This is hard to script. May require a custom test harness or manual testing only.
