/**
 * pi-omni-compact: Extension entry point.
 *
 * Overrides compaction and branch summarization by delegating to a
 * large-context Gemini model subprocess. Falls back to default
 * compaction on any failure.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { resolveModel } from "./models.js";
import {
  BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
  COMPACTION_INCREMENTAL_SYSTEM_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
} from "./prompts.js";
import {
  serializeBranchInput,
  serializeCompactionInput,
} from "./serializer.js";
import { loadSettings } from "./settings.js";
import { runSummarizationAgent } from "./subprocess.js";

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    const settings = loadSettings();

    // Resolve model
    const model = await resolveModel(ctx.modelRegistry, settings.models);
    if (!model) {
      ctx.ui.notify(
        "omni-compact: no configured model available, using default compaction",
        "warning"
      );
      return undefined;
    }

    ctx.ui.notify(
      `omni-compact: summarizing with ${model.provider}/${model.model}`,
      "info"
    );

    // Serialize event data
    const input = serializeCompactionInput(event.preparation);

    // Pick system prompt variant
    const systemPrompt = event.preparation.previousSummary
      ? COMPACTION_INCREMENTAL_SYSTEM_PROMPT
      : COMPACTION_SYSTEM_PROMPT;

    try {
      const summary = await runSummarizationAgent(
        input,
        systemPrompt,
        model,
        event.signal,
        ctx.cwd
      );

      if (!summary) {
        if (!event.signal.aborted) {
          ctx.ui.notify(
            "omni-compact: subprocess returned empty output, using default compaction",
            "warning"
          );
        }
        return undefined;
      }

      return {
        compaction: {
          summary,
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `omni-compact: compaction failed (${message}), using default`,
        "error"
      );
      return undefined;
    }
  });

  pi.on("session_before_tree", async (event, ctx) => {
    // Skip if user didn't want a summary
    if (!event.preparation.userWantsSummary) {
      return undefined;
    }

    const settings = loadSettings();

    // Resolve model
    const model = await resolveModel(ctx.modelRegistry, settings.models);
    if (!model) {
      ctx.ui.notify(
        "omni-compact: no configured model available, using default summarization",
        "warning"
      );
      return undefined;
    }

    ctx.ui.notify(
      `omni-compact: branch summary with ${model.provider}/${model.model}`,
      "info"
    );

    // Serialize branch entries
    const input = serializeBranchInput(event.preparation.entriesToSummarize);

    try {
      const summary = await runSummarizationAgent(
        input,
        BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
        model,
        event.signal,
        ctx.cwd
      );

      if (!summary) {
        if (!event.signal.aborted) {
          ctx.ui.notify(
            "omni-compact: subprocess returned empty output, using default summarization",
            "warning"
          );
        }
        return undefined;
      }

      return {
        summary: {
          summary,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `omni-compact: branch summary failed (${message}), using default`,
        "error"
      );
      return undefined;
    }
  });
}
