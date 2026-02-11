/**
 * Settings types and loader for pi-omni-compact.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface ModelConfig {
  provider: string;
  id: string;
  thinking: string;
}

export interface OmniCompactSettings {
  models: ModelConfig[];
}

const DEFAULT_SETTINGS: OmniCompactSettings = {
  models: [
    { provider: "google-antigravity", id: "gemini-3-flash", thinking: "high" },
    {
      provider: "google-antigravity",
      id: "gemini-3-pro-low",
      thinking: "high",
    },
  ],
};

/**
 * Load settings from settings.json in the extension directory.
 * Falls back to defaults if the file doesn't exist or is invalid.
 */
export function loadSettings(): OmniCompactSettings {
  const extensionDir = path.dirname(fileURLToPath(import.meta.url));
  const settingsPath = path.join(extensionDir, "..", "settings.json");

  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<OmniCompactSettings>;
    return {
      models: Array.isArray(parsed.models)
        ? parsed.models
        : DEFAULT_SETTINGS.models,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
