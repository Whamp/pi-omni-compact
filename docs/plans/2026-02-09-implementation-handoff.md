# pi-omni-compact: Implementation Handoff

## What This Is

A pi extension that overrides compaction and branch summarization by delegating to a large-context (1M token) Gemini model subprocess. Read the full design at `docs/plans/2026-02-09-omni-compact-design.md`.

## Implementation Order

Build and test each module bottom-up. Each step should produce working code before moving to the next.

### Step 1: Package scaffolding

Create `package.json` with pi extension manifest:
```json
{
  "name": "pi-omni-compact",
  "version": "0.1.0",
  "pi": { "extensions": ["./index.ts"] }
}
```

Create `settings.json` with default model configuration.

Create `settings.ts` — types for settings, function to load `settings.json` from the extension's own directory (use `import.meta.url` or `__dirname` to resolve relative to the extension).

### Step 2: `models.ts` — Model resolution

Export a function that takes `ctx.modelRegistry` and the settings model list, returns the first model with a valid API key (or `undefined`).

```typescript
interface ResolvedModel {
  provider: string;
  model: string;
  thinking: string;
  apiKey: string;
}
```

Use `ctx.modelRegistry.find(provider, id)` and `ctx.modelRegistry.getApiKey(model)`. Iterate the configured list in order.

### Step 3: `serializer.ts` — Hybrid input builder

Export functions to serialize compaction and branch summarization event data into the hybrid text format.

For compaction, combine:
- `serializeConversation(convertToLlm(messagesToSummarize))` — the conversation
- `serializeConversation(convertToLlm(turnPrefixMessages))` — if split turn
- Metadata block with file ops, token count, split turn flag
- Previous summary (if incremental compaction)

For branch summarization:
- Serialize `entriesToSummarize` — these are `SessionEntry[]`, not `AgentMessage[]`. Extract messages from entries the same way the compaction source does (check `getMessageFromEntry` in `compaction.ts` for the pattern — it handles `message`, `custom_message`, `branch_summary`, and `compaction` entry types).

Import `convertToLlm` and `serializeConversation` from `@mariozechner/pi-coding-agent`.

### Step 4: `prompts.ts` — System prompts

Two system prompts:

**Compaction system prompt:** Instructs the model to read the provided session input, optionally read referenced source files for context, and produce the enhanced summary format (Goal, Constraints, Progress, Key Decisions, File Changes, Code Patterns, Open Questions, Error History, Next Steps, Critical Context, read-files, modified-files).

Include two variants:
- Initial (no previous summary) — summarize from scratch
- Incremental (previous summary provided) — merge, update Progress, prune resolved items

**Branch summarization system prompt:** Similar but focused on preserving context from an abandoned branch. Emphasize what the branch accomplished, where it diverged, and what the agent should know if it revisits this work.

Both prompts should emphasize:
- Density over length
- Capture what changed AND why
- Record error fixes to prevent reintroduction
- Use active voice, concrete language
- The model can and should `read` referenced files if it would improve the summary

### Step 5: `subprocess.ts` — Pi subprocess runner

Export a function:
```typescript
async function runSummarizationAgent(
  input: string,
  systemPrompt: string,
  model: ResolvedModel,
  signal: AbortSignal,
  cwd: string,
  piReadMapPath: string,
): Promise<string | undefined>
```

Follow the pattern from `examples/extensions/subagent/index.ts`:

1. Create temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "pi-omni-compact-"))`
2. Write `input` to `input.md` in temp dir
3. Write `systemPrompt` to a prompt file in temp dir
4. Spawn: `pi --mode json -p --no-session --provider <provider> --model <model> --thinking <thinking> --tools read,grep,find,ls -e <piReadMapPath> --system-prompt <promptFile> @<inputFile> "Produce an enhanced compaction summary. Read any referenced files that would help preserve important context."`
5. Parse stdout line by line as JSON. Collect `message_end` events where `message.role === "assistant"`. Extract text content.
6. On `signal` abort: kill process with SIGTERM, SIGKILL after 5s timeout
7. Clean up temp files in `finally`
8. Return final assistant text, or `undefined` if empty/failed

Key details from the subagent implementation:
- Use `spawn("pi", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] })`
- Buffer stdout, split on newlines, parse each complete line as JSON
- Process remaining buffer after process closes
- `message_end` events have shape `{ type: "message_end", message: { role, content: [...] } }`
- Extract text from `message.content` blocks where `type === "text"`

### Step 6: `index.ts` — Extension entry point

Wire everything together:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    // 1. Load settings
    // 2. Resolve model (return undefined if none available)
    // 3. Serialize event data to hybrid input
    // 4. Pick system prompt (initial vs incremental based on previousSummary)
    // 5. Run subprocess
    // 6. Return { compaction: { summary, firstKeptEntryId, tokensBefore } }
    // 7. On any failure: ctx.ui.notify(), return undefined
  });

  pi.on("session_before_tree", async (event, ctx) => {
    // 1. Check event.preparation.userWantsSummary — skip if false
    // 2. Load settings
    // 3. Resolve model (return undefined if none available)
    // 4. Serialize entriesToSummarize to hybrid input
    // 5. Run subprocess with branch summarization prompt
    // 6. Return { summary: { summary, details } }
    // 7. On any failure: ctx.ui.notify(), return undefined
  });
}
```

### Step 7: Testing

Test with a real pi session:

1. Start pi with the extension: `pi -e ./index.ts`
2. Have a conversation that creates enough context
3. Run `/compact` manually — verify the extension intercepts and produces enhanced output
4. Check fallback: temporarily misconfigure the model in settings.json — verify pi falls back to default compaction with a notification

## Key Reference Files

Read these before implementing:

| File | Why |
|------|-----|
| `docs/plans/2026-02-09-omni-compact-design.md` | Full design document |
| `~/tools/pi-mono/packages/coding-agent/examples/extensions/subagent/index.ts` | Subprocess spawning pattern — follow this exactly |
| `~/tools/pi-mono/packages/coding-agent/examples/extensions/custom-compaction.ts` | How to intercept `session_before_compact` and return a custom CompactionResult |
| `~/tools/pi-mono/packages/coding-agent/examples/extensions/trigger-compact.ts` | How `ctx.compact()` and `ctx.getContextUsage()` work |
| `~/tools/pi-mono/packages/coding-agent/src/core/compaction/compaction.ts` | Default compaction implementation — `prepareCompaction()`, `compact()`, `CompactionPreparation`, `CompactionResult` types |
| `~/tools/pi-mono/packages/coding-agent/src/core/compaction/utils.ts` | `serializeConversation()`, `FileOperations`, `formatFileOperations()` |
| `~/tools/pi-mono/packages/coding-agent/src/core/extensions/types.ts` | `SessionBeforeCompactEvent`, `SessionBeforeCompactResult`, `SessionBeforeTreeEvent`, `SessionBeforeTreeResult`, `CompactOptions`, `ExtensionContext` |
| `~/tools/pi-mono/packages/coding-agent/docs/extensions.md` | Extension API reference |
| `~/tools/pi-mono/packages/coding-agent/docs/compaction.md` | Compaction and branch summarization docs |
| `~/projects/pi-read-map/README.md` | pi-read-map extension — loaded in the subprocess |

## Important Notes

- **Auth is handled by pi.** `ctx.modelRegistry.find()` + `ctx.modelRegistry.getApiKey()` resolve everything. No manual auth code.
- **The extension never calls `sessionManager.appendCompaction()`.** It returns the summary content and pi handles persistence.
- **`convertToLlm` and `serializeConversation`** are exported from `@mariozechner/pi-coding-agent`. Use them — don't reimplement.
- **pi-read-map must be installed** for the subprocess to use it. The extension should resolve its path (check `~/.pi/agent/extensions/pi-read-map/` or use `which pi-read-map` or similar).
- **The `signal` from the event must be passed through** to the subprocess. If the user cancels compaction, the subprocess must be killed.
- **Return `undefined` (not `{ cancel: true }`)** to fall back to default compaction. `{ cancel: true }` prevents compaction entirely.
