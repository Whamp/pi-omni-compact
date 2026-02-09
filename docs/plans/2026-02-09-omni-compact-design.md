# pi-omni-compact: Design

A pi extension that overrides compaction and branch summarization with a large-context model subprocess. Instead of the default summarizer (which uses the active session model), this extension delegates to a 1M-context Gemini model that can ingest the entire session history, read referenced source files via pi-read-map, and produce a maximally information-dense summary.

## Problem

Pi's default compaction uses the same model as the conversation. That model has limited context (often 200k tokens) and produces a structured summary without access to the actual source files referenced in the session. Critical information — specific file changes, error resolutions, established patterns, open questions — gets lost during compaction.

## Solution

Intercept `session_before_compact` and `session_before_tree` events. Spawn a pi subprocess with a 1M-context model, read-only tools, and pi-read-map loaded as an extension. The subprocess reads the serialized session and any referenced source files, then returns an enhanced summary. On failure, fall through to pi's default compaction.

## Architecture

### File Structure

```
pi-omni-compact/
├── index.ts          # Extension entry: registers event handlers
├── models.ts         # Model resolution: try configured models via ctx.modelRegistry
├── subprocess.ts     # Spawn pi subprocess, parse JSON events, extract output
├── serializer.ts     # Convert event data to hybrid input (conversation + metadata)
├── prompts.ts        # System prompts for compaction and branch summarization
├── settings.ts       # Types, defaults, load settings.json
├── settings.json     # User config: model list, thinking level
└── package.json      # Extension manifest with pi entry point
```

### Data Flow

```
session_before_compact / session_before_tree
  │
  ├─ models.ts: resolve model + API key
  │   └─ fail? → return undefined (default compaction)
  │
  ├─ serializer.ts: event data → temp file
  │   ├─ serializeConversation(convertToLlm(messages))
  │   └─ append metadata block (file ops, token count, previous summary)
  │
  ├─ subprocess.ts: spawn pi -p --mode json
  │   ├─ --provider/--model/--thinking from resolved model
  │   ├─ --tools read,grep,find,ls
  │   ├─ -e <path-to-pi-read-map>
  │   ├─ --system-prompt from prompts.ts
  │   ├─ @tempfile as input
  │   ├─ parse JSON events → extract final assistant text
  │   └─ fail? → return undefined (default compaction)
  │
  └─ return CompactionResult or branch summary
```

### Event Handlers

**`session_before_compact`** — fires on both auto-compaction and manual `/compact`.

Receives `CompactionPreparation` with:
- `messagesToSummarize` — messages to discard after summarization
- `turnPrefixMessages` — early part of a split turn (if the current turn exceeds keepRecentTokens)
- `previousSummary` — summary from the last compaction (for incremental updates)
- `fileOps` — cumulative file operations (read/written/edited)
- `firstKeptEntryId` — UUID of first entry to keep
- `tokensBefore` — total tokens before compaction

Also receives `branchEntries` (full branch), `customInstructions` (from `/compact` args), and `signal` (AbortSignal).

Returns `{ compaction: { summary, firstKeptEntryId, tokensBefore, details? } }` or `undefined` for fallback.

**`session_before_tree`** — fires on `/tree` navigation.

Receives `TreePreparation` with:
- `entriesToSummarize` — entries from the branch being abandoned
- `userWantsSummary` — whether the user chose to summarize

Returns `{ summary: { summary, details? } }` or `undefined` for fallback. Skips processing when `userWantsSummary` is false.

### Model Resolution

Configured via `settings.json`:

```json
{
  "models": [
    { "provider": "google-antigravity", "id": "gemini-3-flash", "thinking": "high" },
    { "provider": "google-antigravity", "id": "gemini-3-pro-low", "thinking": "high" }
  ]
}
```

Resolution uses `ctx.modelRegistry.find(provider, id)` and `ctx.modelRegistry.getApiKey(model)`. Pi handles all auth via `~/.pi/agent/auth.json`. The extension iterates the model list and uses the first model with a valid API key. If none resolve, the handler returns `undefined` and pi runs default compaction.

### Subprocess Execution

Follows the same pattern as pi's built-in `subagent` tool (`examples/extensions/subagent/index.ts`):

1. Write serialized input to a temp file via `fs.mkdtempSync` + `fs.writeFileSync`
2. Spawn `pi` with `spawn("pi", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] })`
3. Parse stdout line-by-line as JSON events
4. Extract final assistant text from `message_end` events where `message.role === "assistant"`
5. Clean up temp files in `finally` block

Subprocess args:
```
pi --mode json -p --no-session \
  --provider <provider> --model <model> \
  --thinking <level> \
  --tools read,grep,find,ls \
  -e <path-to-pi-read-map> \
  --system-prompt <compaction-system-prompt> \
  @/tmp/pi-compact-XXXXX/input.md \
  "Produce an enhanced compaction summary. Read any referenced files that would help."
```

The `@` prefix includes the temp file contents as part of the prompt. The agent can then `read` source files mentioned in the session, getting pi-read-map structural maps for large files automatically.

Abort handling: when `signal` aborts, kill the subprocess with `SIGTERM`, then `SIGKILL` after 5 seconds.

### Serializer: Hybrid Input Format

Combines serialized conversation with structured metadata:

**Conversation section** (using pi's existing utilities):
```
<conversation>
[User]: Build a rate limiter middleware...
[Assistant thinking]: The user wants...
[Assistant]: I'll create a sliding window rate limiter...
[Assistant tool calls]: read(path="src/middleware/index.ts")
[Tool result]: export { authMiddleware } from...
</conversation>
```

Generated via `serializeConversation(convertToLlm(messages))` from `@mariozechner/pi-coding-agent`.

**Metadata section:**
```
<metadata>
<token-count>148392</token-count>
<split-turn>false</split-turn>
<file-operations>
  read: src/middleware/index.ts, src/auth.ts
  written: src/middleware/rate-limit.ts
  edited: src/middleware/index.ts
</file-operations>
</metadata>
```

**Previous summary** (for incremental compaction):
```
<previous-summary>
## Goal
...existing summary content...
</previous-summary>
```

For branch summarization, the conversation section contains the entries being abandoned instead of messages being compacted.

### Enhanced Summary Format

The system prompt instructs the model to produce:

```markdown
## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements, style preferences, architectural decisions]

## Progress
### Done
- [x] Completed work with specific details

### In Progress
- [ ] Current work

### Blocked
- [Issues, if any]

## Key Decisions
- **[Decision]**: [Rationale]

## File Changes
- `src/auth.ts` — Added retry logic to handleLogin, extracted token refresh
- `src/middleware/rate-limit.ts` — New file, sliding window rate limiter
- `tests/auth.test.ts` — Added 3 test cases for retry edge cases

## Code Patterns Established
- Error handling uses Result type, not exceptions
- All API routes validate input with zod schemas before processing
- Test files colocated with source, named `*.test.ts`

## Open Questions
- Whether to use Redis or in-memory for rate limit storage (deferred)
- GraphQL vs REST for the public API (user hasn't decided)

## Error History
- `TypeError: Cannot read property 'id' of undefined` in auth.ts:42 — missing null check on user lookup, fixed with early return
- Build failed from circular import between auth.ts and user.ts — extracted shared types to types.ts

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Data, examples, references needed to continue]

<read-files>
path/to/file.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

Two prompt variants:
- **Initial compaction** — no previous summary, summarize from scratch
- **Incremental compaction** — previous summary provided, merge new information, update Progress (move In Progress → Done), prune resolved errors/questions

Emphasis: density over length. Capture *what* changed and *why*, not diffs. Record error fixes to prevent reintroduction after compaction.

### Error Handling & Fallback Chain

Three layers:

**Layer 1 — Model resolution:** No configured model has a valid API key → return `undefined`. Pi runs default compaction. Notify user.

**Layer 2 — Subprocess execution:** Non-zero exit, crash, or abort → return `undefined`. Notify user. Clean up temp files.

**Layer 3 — Output validation:** Empty final output → return `undefined`. Notify user.

All fallback paths use `ctx.ui.notify()` to inform the user, then return `undefined` so pi's default compaction runs seamlessly. No data loss, no broken state.

Temp file cleanup always runs in a `finally` block. Cleanup failures are silently ignored (OS temp dir handles eventual cleanup).

### Shared Infrastructure

Both handlers (compaction and branch summarization) call the same core function:

```typescript
runSummarizationAgent(
  input: string,           // serialized hybrid input
  systemPrompt: string,    // compaction vs branch prompt
  signal: AbortSignal,
  settings: OmniCompactSettings
): Promise<string | undefined>
```

This function handles model resolution, temp file management, subprocess spawning, JSON parsing, and error handling. The event handlers are thin wrappers that serialize their specific event data and map the subprocess output to the correct return shape.

## Dependencies

**Runtime:**
- `@mariozechner/pi-coding-agent` — `convertToLlm`, `serializeConversation`, extension types
- `pi` CLI — spawned as subprocess
- `pi-read-map` — loaded as extension in subprocess (must be installed)

**Node built-ins:**
- `node:child_process` — `spawn`
- `node:fs` — temp file I/O
- `node:os` — `tmpdir`
- `node:path` — path joining

## Configuration

`settings.json` (user-editable, lives in extension directory):

```json
{
  "models": [
    { "provider": "google-antigravity", "id": "gemini-3-flash", "thinking": "high" },
    { "provider": "google-antigravity", "id": "gemini-3-pro-low", "thinking": "high" }
  ]
}
```

## Installation

The extension is a directory-style pi extension. Install globally:

```bash
pi install ./pi-omni-compact
```

Or symlink into `~/.pi/agent/extensions/pi-omni-compact`.

Requires `pi-read-map` to be installed (`pi install npm:pi-read-map`).
