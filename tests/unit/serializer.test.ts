import { describe, expect, it } from "vitest";

import {
  serializeBranchInput,
  serializeCompactionInput,
} from "../../src/serializer.js";
import {
  assistantMessage,
  branchSummaryEntry,
  compactionEntry,
  createBranchEntries,
  createPreparation,
  customMessageEntry,
  messageEntry,
  userMessage,
} from "../helpers/fixtures.js";

describe("serializeCompactionInput", () => {
  it("produces conversation tags wrapping serialized messages", () => {
    const prep = createPreparation();
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<conversation>");
    expect(output).toContain("</conversation>");
    // Should contain user message text
    expect(output).toContain("rate limiter");
    expect(output).toContain("Express");
  });

  it("includes metadata section with token count", () => {
    const prep = createPreparation({ tokensBefore: 200_000 });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<metadata>");
    expect(output).toContain("<token-count>200000</token-count>");
    expect(output).toContain("</metadata>");
  });

  it("includes split turn flag in metadata", () => {
    const prep = createPreparation({ isSplitTurn: false });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<split-turn>false</split-turn>");
  });

  it("includes file operations in metadata", () => {
    const prep = createPreparation();
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<file-operations>");
    expect(output).toContain("read: src/middleware/index.ts");
    expect(output).toContain("written: src/middleware/rate-limit.ts");
    expect(output).toContain("</file-operations>");
  });

  it("shows (none) when no file operations", () => {
    const prep = createPreparation({
      fileOps: {
        read: new Set<string>(),
        written: new Set<string>(),
        edited: new Set<string>(),
      },
    });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<file-operations>");
    expect(output).toContain("(none)");
  });

  it("includes previous summary for incremental compaction", () => {
    const prevSummary =
      "## Goal\nBuild a web server\n\n## Progress\n- [x] Set up Express";
    const prep = createPreparation({ previousSummary: prevSummary });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<previous-summary>");
    expect(output).toContain("Build a web server");
    expect(output).toContain("Set up Express");
    expect(output).toContain("</previous-summary>");
  });

  it("omits previous summary section when not present", () => {
    const prep = createPreparation({ previousSummary: undefined });
    const output = serializeCompactionInput(prep);

    expect(output).not.toContain("<previous-summary>");
  });

  it("includes turn prefix section when split turn", () => {
    const prep = createPreparation({
      isSplitTurn: true,
      turnPrefixMessages: [
        userMessage("Initial question about auth"),
        assistantMessage("Here's my plan for authentication..."),
      ],
    });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<turn-prefix>");
    expect(output).toContain("Initial question about auth");
    expect(output).toContain("</turn-prefix>");
    expect(output).toContain("<split-turn>true</split-turn>");
  });

  it("omits turn prefix section when not split", () => {
    const prep = createPreparation({
      isSplitTurn: false,
      turnPrefixMessages: [],
    });
    const output = serializeCompactionInput(prep);

    expect(output).not.toContain("<turn-prefix>");
  });

  it("serializes tool calls in conversation", () => {
    const prep = createPreparation();
    const output = serializeCompactionInput(prep);

    // serializeConversation renders tool calls like: read(path="src/middleware/index.ts")
    expect(output).toContain("read");
    expect(output).toContain("src/middleware/index.ts");
  });

  it("serializes tool results in conversation", () => {
    const prep = createPreparation();
    const output = serializeCompactionInput(prep);

    expect(output).toContain("authMiddleware");
  });

  it("handles empty messages gracefully", () => {
    const prep = createPreparation({ messagesToSummarize: [] });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("<conversation>");
    expect(output).toContain("</conversation>");
    expect(output).toContain("<metadata>");
  });

  it("includes edited files in file operations", () => {
    const prep = createPreparation({
      fileOps: {
        read: new Set<string>(),
        written: new Set<string>(),
        edited: new Set(["src/config.ts", "src/utils.ts"]),
      },
    });
    const output = serializeCompactionInput(prep);

    expect(output).toContain("edited: src/config.ts, src/utils.ts");
  });
});

describe("serializeBranchInput", () => {
  it("extracts and serializes messages from session entries", () => {
    const entries = createBranchEntries();
    const output = serializeBranchInput(entries);

    expect(output).toContain("<conversation>");
    expect(output).toContain("</conversation>");
    // Should contain the user's request
    expect(output).toContain("JWT");
    expect(output).toContain("authentication");
  });

  it("includes assistant tool calls from entries", () => {
    const entries = createBranchEntries();
    const output = serializeBranchInput(entries);

    expect(output).toContain("read");
    expect(output).toContain("src/auth.ts");
  });

  it("handles branch_summary entries", () => {
    const entries = [
      branchSummaryEntry("Previous branch accomplished X, Y, Z"),
    ];
    const output = serializeBranchInput(entries);

    expect(output).toContain("<conversation>");
    // Branch summaries are converted to messages and serialized
    expect(output).toContain("Previous branch accomplished X, Y, Z");
  });

  it("handles compaction entries", () => {
    const entries = [compactionEntry("## Goal\nBuild auth system")];
    const output = serializeBranchInput(entries);

    expect(output).toContain("Build auth system");
  });

  it("handles custom_message entries", () => {
    const entries = [
      customMessageEntry("note", "Important context about the codebase"),
    ];
    const output = serializeBranchInput(entries);

    expect(output).toContain("Important context about the codebase");
  });

  it("skips non-message entry types", () => {
    const thinkingEntry = {
      type: "thinking_level_change" as const,
      thinkingLevel: "high",
      id: "tlc_1",
      parentId: null,
      timestamp: new Date().toISOString(),
    };
    const entries = [
      thinkingEntry as never,
      messageEntry(userMessage("Hello")),
    ];
    const output = serializeBranchInput(entries);

    // Should still have the user message
    expect(output).toContain("Hello");
    // But not crash on the thinking_level_change
  });

  it("handles empty entries array", () => {
    const output = serializeBranchInput([]);

    expect(output).toContain("<conversation>");
    expect(output).toContain("</conversation>");
  });

  it("preserves message ordering", () => {
    const entries = [
      messageEntry(userMessage("First message")),
      messageEntry(assistantMessage("Second message")),
      messageEntry(userMessage("Third message")),
    ];
    const output = serializeBranchInput(entries);

    const firstIdx = output.indexOf("First message");
    const secondIdx = output.indexOf("Second message");
    const thirdIdx = output.indexOf("Third message");

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
