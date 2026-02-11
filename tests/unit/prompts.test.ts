import { describe, expect, it } from "vitest";

import {
  BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
  COMPACTION_INCREMENTAL_SYSTEM_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
} from "../../src/prompts.js";

describe("compaction system prompt", () => {
  it("instructs the model to produce a summary, not continue conversation", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain(
      "Do NOT continue the conversation"
    );
    expect(COMPACTION_SYSTEM_PROMPT).toContain(
      "ONLY output the structured summary"
    );
  });

  it("includes the enhanced format sections", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Goal");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Progress");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Key Decisions");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## File Changes");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Code Patterns Established");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Open Questions");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Error History");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Next Steps");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Critical Context");
  });

  it("includes read-files and modified-files tags", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("<read-files>");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("<modified-files>");
  });

  it("mentions tool access for reading files", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("read, grep, find, and ls");
  });

  it("emphasizes density over length", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("Density over length");
  });

  it("emphasizes capturing what AND why", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("WHAT changed AND WHY");
  });
});

describe("compaction incremental system prompt", () => {
  it("instructs to merge with existing summary", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "merge them into an existing summary"
    );
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "<previous-summary>"
    );
  });

  it("instructs to preserve existing information", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "PRESERVE all existing information"
    );
  });

  it("instructs to update progress", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      'move "In Progress" items to "Done"'
    );
  });

  it("instructs to prune resolved items", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "PRUNE resolved errors"
    );
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "resolved questions from Open Questions"
    );
  });

  it("has the same enhanced format as initial prompt", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain("## Goal");
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain("## File Changes");
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain("## Error History");
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain("## Next Steps");
  });

  it("does not continue conversation", () => {
    expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(
      "Do NOT continue the conversation"
    );
  });
});

describe("branch summarization system prompt", () => {
  it("focuses on branch context preservation", () => {
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain(
      "branch being abandoned"
    );
  });

  it("emphasizes divergence and outcomes", () => {
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("diverged");
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain(
      "completed successfully"
    );
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("failed and why");
  });

  it("instructs for revisit context", () => {
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("revisits this work");
  });

  it("has the enhanced format sections", () => {
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("## Goal");
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("## Progress");
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("## Next Steps");
  });

  it("does not continue conversation", () => {
    expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain(
      "Do NOT continue the conversation"
    );
  });
});

describe("prompt distinctness", () => {
  it("initial and incremental prompts are different", () => {
    expect(COMPACTION_SYSTEM_PROMPT).not.toBe(
      COMPACTION_INCREMENTAL_SYSTEM_PROMPT
    );
  });

  it("compaction and branch prompts are different", () => {
    expect(COMPACTION_SYSTEM_PROMPT).not.toBe(
      BRANCH_SUMMARIZATION_SYSTEM_PROMPT
    );
  });

  it("all three prompts share the enhanced format", () => {
    const sharedSections = [
      "## Goal",
      "## Constraints & Preferences",
      "## Progress",
      "## Key Decisions",
      "## File Changes",
      "## Next Steps",
    ];
    for (const section of sharedSections) {
      expect(COMPACTION_SYSTEM_PROMPT).toContain(section);
      expect(COMPACTION_INCREMENTAL_SYSTEM_PROMPT).toContain(section);
      expect(BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain(section);
    }
  });
});
