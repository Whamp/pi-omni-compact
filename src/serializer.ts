/**
 * Hybrid input serializer for pi-omni-compact.
 *
 * Converts compaction and branch summarization event data
 * into a structured text format combining conversation and metadata.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import {
  type FileOperations,
  type SessionEntry,
  convertToLlm,
  serializeConversation,
} from "@mariozechner/pi-coding-agent";

/** Subset of CompactionPreparation needed for serialization */
interface CompactionInput {
  messagesToSummarize: AgentMessage[];
  turnPrefixMessages: AgentMessage[];
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;
  fileOps: FileOperations;
}

/**
 * Extract an AgentMessage from a session entry, mirroring the pattern
 * from compaction.ts's getMessageFromEntry().
 */
function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") {
    return entry.message;
  }
  if (entry.type === "custom_message") {
    // Build a minimal custom-role message for serialization
    return {
      role: "custom" as const,
      customType: entry.customType,
      content:
        typeof entry.content === "string" ? entry.content : entry.content,
      display: entry.display,
      details: entry.details,
      timestamp: new Date(entry.timestamp).getTime(),
    } as AgentMessage;
  }
  if (entry.type === "branch_summary") {
    return {
      role: "branchSummary" as const,
      summary: entry.summary,
      fromId: entry.fromId,
      timestamp: new Date(entry.timestamp).getTime(),
    } as AgentMessage;
  }
  if (entry.type === "compaction") {
    return {
      role: "compactionSummary" as const,
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    } as AgentMessage;
  }
  return undefined;
}

/**
 * Format file operations into the metadata section.
 */
function formatFileOps(fileOps: FileOperations): string {
  const parts: string[] = [];
  if (fileOps.read.size > 0) {
    parts.push(`  read: ${[...fileOps.read].join(", ")}`);
  }
  if (fileOps.written.size > 0) {
    parts.push(`  written: ${[...fileOps.written].join(", ")}`);
  }
  if (fileOps.edited.size > 0) {
    parts.push(`  edited: ${[...fileOps.edited].join(", ")}`);
  }
  if (parts.length === 0) {
    return "  (none)";
  }
  return parts.join("\n");
}

/**
 * Serialize compaction preparation data into hybrid input format.
 */
export function serializeCompactionInput(preparation: CompactionInput): string {
  const {
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn,
    tokensBefore,
    previousSummary,
    fileOps,
  } = preparation;

  const sections: string[] = [];

  // Main conversation
  const conversationText = serializeConversation(
    convertToLlm(messagesToSummarize)
  );
  sections.push(`<conversation>\n${conversationText}\n</conversation>`);

  // Turn prefix (if split turn)
  if (isSplitTurn && turnPrefixMessages.length > 0) {
    const prefixText = serializeConversation(convertToLlm(turnPrefixMessages));
    sections.push(`<turn-prefix>\n${prefixText}\n</turn-prefix>`);
  }

  // Metadata
  const metadataLines = [
    "<metadata>",
    `<token-count>${tokensBefore}</token-count>`,
    `<split-turn>${isSplitTurn}</split-turn>`,
    "<file-operations>",
    formatFileOps(fileOps),
    "</file-operations>",
    "</metadata>",
  ];
  sections.push(metadataLines.join("\n"));

  // Previous summary (for incremental compaction)
  if (previousSummary) {
    sections.push(
      `<previous-summary>\n${previousSummary}\n</previous-summary>`
    );
  }

  return sections.join("\n\n");
}

/**
 * Serialize branch entries into hybrid input format for branch summarization.
 */
export function serializeBranchInput(
  entriesToSummarize: SessionEntry[]
): string {
  const messages: AgentMessage[] = [];
  for (const entry of entriesToSummarize) {
    const msg = getMessageFromEntry(entry);
    if (msg) {
      messages.push(msg);
    }
  }

  const conversationText = serializeConversation(convertToLlm(messages));
  return `<conversation>\n${conversationText}\n</conversation>`;
}
