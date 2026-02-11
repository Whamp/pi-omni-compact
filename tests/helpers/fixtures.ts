/**
 * Test fixtures for pi-omni-compact.
 *
 * Sample messages, session entries, and preparation objects
 * that mirror real pi data structures.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

/** A minimal user message */
export function userMessage(
  text: string,
  timestamp = Date.now()
): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp,
  } as AgentMessage;
}

/** A minimal assistant message with text */
export function assistantMessage(
  text: string,
  timestamp = Date.now()
): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp,
  } as AgentMessage;
}

/** An assistant message with a tool call */
export function assistantWithToolCall(
  toolName: string,
  args: Record<string, unknown>,
  text?: string,
  timestamp = Date.now()
): AgentMessage {
  const content: Record<string, unknown>[] = [];
  if (text) {
    content.push({ type: "text", text });
  }
  content.push({
    type: "toolCall",
    id: `call_${Date.now()}`,
    name: toolName,
    arguments: args,
  });
  return {
    role: "assistant",
    content,
    timestamp,
  } as AgentMessage;
}

/** A tool result message */
export function toolResultMessage(
  text: string,
  toolCallId = "call_1",
  timestamp = Date.now()
): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    content: [{ type: "text", text }],
    isError: false,
    timestamp,
  } as AgentMessage;
}

/** A session entry wrapping a message */
export function messageEntry(
  msg: AgentMessage,
  id = `entry_${Date.now()}`
): SessionEntry {
  return {
    type: "message",
    message: msg,
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
  } as SessionEntry;
}

/** A branch summary session entry */
export function branchSummaryEntry(
  summary: string,
  fromId = "from_1",
  id = "bs_1"
): SessionEntry {
  return {
    type: "branch_summary",
    summary,
    fromId,
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
  } as SessionEntry;
}

/** A compaction session entry */
export function compactionEntry(
  summary: string,
  tokensBefore = 100_000,
  id = "comp_1"
): SessionEntry {
  return {
    type: "compaction",
    summary,
    tokensBefore,
    firstKeptEntryId: "kept_1",
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
  } as SessionEntry;
}

/** A custom_message session entry */
export function customMessageEntry(
  customType: string,
  content: string,
  id = "cm_1"
): SessionEntry {
  return {
    type: "custom_message",
    customType,
    content,
    display: true,
    details: undefined,
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
  } as SessionEntry;
}

/**
 * Build a realistic CompactionPreparation-like object.
 */
export function createPreparation(overrides?: Record<string, unknown>) {
  const defaults = {
    firstKeptEntryId: "entry_keep_1",
    messagesToSummarize: [
      userMessage("Build a rate limiter middleware for Express"),
      assistantWithToolCall(
        "read",
        { path: "src/middleware/index.ts" },
        "I'll read the current middleware setup."
      ),
      toolResultMessage('export { authMiddleware } from "./auth.js";'),
      assistantMessage(
        "I see the middleware directory. I'll create a sliding window rate limiter.\n\n" +
          "```typescript\nexport function rateLimiter(options: RateLimitOptions) {\n  // ...\n}\n```"
      ),
      userMessage("Looks good, but add Redis support"),
      assistantWithToolCall("write", {
        path: "src/middleware/rate-limit.ts",
        content: "// rate limiter...",
      }),
      assistantMessage(
        "Done. The rate limiter now supports both in-memory and Redis backends."
      ),
    ],
    turnPrefixMessages: [] as AgentMessage[],
    isSplitTurn: false,
    tokensBefore: 148_392,
    previousSummary: undefined as string | undefined,
    fileOps: {
      read: new Set(["src/middleware/index.ts"]),
      written: new Set(["src/middleware/rate-limit.ts"]),
      edited: new Set<string>(),
    },
    settings: {
      enabled: true,
      reserveTokens: 16_384,
      keepRecentTokens: 20_000,
    },
  };

  return { ...defaults, ...overrides };
}

/**
 * Build a realistic set of session entries for branch summarization.
 */
export function createBranchEntries(): SessionEntry[] {
  return [
    messageEntry(userMessage("Implement user authentication with JWT")),
    messageEntry(
      assistantWithToolCall(
        "read",
        { path: "src/auth.ts" },
        "Let me check the auth module."
      )
    ),
    messageEntry(toolResultMessage("export function login() { /* ... */ }")),
    messageEntry(
      assistantMessage("I'll add JWT token generation and validation.")
    ),
    messageEntry(
      assistantWithToolCall(
        "write",
        { path: "src/auth.ts", content: "// updated auth..." },
        "Writing the updated auth module."
      )
    ),
    messageEntry(
      assistantMessage(
        "Authentication is now using JWT. I've added token generation, validation, and refresh."
      )
    ),
    messageEntry(
      userMessage("Can you also add rate limiting to the login endpoint?")
    ),
    messageEntry(
      assistantMessage(
        "Sure, I'll add rate limiting to prevent brute force attacks."
      )
    ),
  ];
}
