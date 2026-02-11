/**
 * Model resolution for pi-omni-compact.
 *
 * Iterates the configured model list and returns the first model
 * with a valid API key from the model registry.
 */

import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

import type { ModelConfig } from "./settings.js";

export interface ResolvedModel {
  provider: string;
  model: string;
  thinking: string;
  apiKey: string;
}

/**
 * Resolve the first available model from the configured list.
 * Returns undefined if no model has a valid API key.
 */
export async function resolveModel(
  modelRegistry: ModelRegistry,
  models: ModelConfig[]
): Promise<ResolvedModel | undefined> {
  for (const config of models) {
    const model = modelRegistry.find(config.provider, config.id);
    if (!model) {
      continue;
    }

    const apiKey = await modelRegistry.getApiKey(model);
    if (!apiKey) {
      continue;
    }

    return {
      provider: config.provider,
      model: config.id,
      thinking: config.thinking,
      apiKey,
    };
  }
  return undefined;
}
