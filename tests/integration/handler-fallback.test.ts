import { describe, expect, it } from "vitest";

import piOmniCompact from "../../src/index.js";
import { createPreparation } from "../helpers/fixtures.js";
import {
  createMockContext,
  createMockPi,
  invokeHandler,
} from "../helpers/mocks.js";

describe("session_before_compact handler", () => {
  it("returns undefined when no model is available", async () => {
    const mockPi = createMockPi();
    piOmniCompact(mockPi as never);

    const ctx = createMockContext();
    ctx.modelRegistry.find.mockReturnValue(null);

    const event = {
      preparation: createPreparation(),
      branchEntries: [],
      signal: new AbortController().signal,
    };

    const result = await invokeHandler(
      mockPi,
      "session_before_compact",
      event,
      ctx
    );

    expect(result).toBeUndefined();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("no configured model"),
      "warning"
    );
  });

  it("returns undefined when model has no API key", async () => {
    const mockPi = createMockPi();
    piOmniCompact(mockPi as never);

    const ctx = createMockContext();
    ctx.modelRegistry.find.mockReturnValue({
      provider: "google",
      id: "gemini-flash",
    });
    ctx.modelRegistry.getApiKey.mockResolvedValue(null);

    const event = {
      preparation: createPreparation(),
      branchEntries: [],
      signal: new AbortController().signal,
    };

    const result = await invokeHandler(
      mockPi,
      "session_before_compact",
      event,
      ctx
    );

    expect(result).toBeUndefined();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("no configured model"),
      "warning"
    );
  });
});

describe("session_before_tree handler", () => {
  it("returns undefined when userWantsSummary is false", async () => {
    const mockPi = createMockPi();
    piOmniCompact(mockPi as never);

    const ctx = createMockContext();

    const event = {
      preparation: {
        targetId: "target_1",
        oldLeafId: "old_1",
        commonAncestorId: "ancestor_1",
        entriesToSummarize: [],
        userWantsSummary: false,
      },
      signal: new AbortController().signal,
    };

    const result = await invokeHandler(
      mockPi,
      "session_before_tree",
      event,
      ctx
    );

    expect(result).toBeUndefined();
    // Should not even try to resolve a model
    expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
  });

  it("returns undefined when no model is available", async () => {
    const mockPi = createMockPi();
    piOmniCompact(mockPi as never);

    const ctx = createMockContext();
    ctx.modelRegistry.find.mockReturnValue(null);

    const event = {
      preparation: {
        targetId: "target_1",
        oldLeafId: "old_1",
        commonAncestorId: "ancestor_1",
        entriesToSummarize: [],
        userWantsSummary: true,
      },
      signal: new AbortController().signal,
    };

    const result = await invokeHandler(
      mockPi,
      "session_before_tree",
      event,
      ctx
    );

    expect(result).toBeUndefined();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("no configured model"),
      "warning"
    );
  });
});
