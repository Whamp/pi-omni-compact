import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSettings } from "../../src/settings.js";

vi.mock("node:fs");
vi.mock("node:url", () => ({
  fileURLToPath: () => "/fake/extension/src/settings.ts",
}));

describe("loadSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads valid settings from settings.json", () => {
    const settingsContent = JSON.stringify({
      models: [{ provider: "google", id: "gemini-flash", thinking: "high" }],
    });
    vi.mocked(fs.readFileSync).mockReturnValue(settingsContent);

    const settings = loadSettings();

    expect(settings.models).toHaveLength(1);
    expect(settings.models[0].provider).toBe("google");
    expect(settings.models[0].id).toBe("gemini-flash");
    expect(settings.models[0].thinking).toBe("high");
  });

  it("returns defaults when settings.json does not exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const settings = loadSettings();

    expect(settings.models).toHaveLength(2);
    expect(settings.models[0].provider).toBe("google-antigravity");
    expect(settings.models[0].id).toBe("gemini-3-flash");
  });

  it("returns defaults when settings.json is invalid JSON", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not json {{{");

    const settings = loadSettings();

    expect(settings.models).toHaveLength(2);
    expect(settings.models[0].provider).toBe("google-antigravity");
  });

  it("returns default models when models field is not an array", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ models: "wrong" })
    );

    const settings = loadSettings();

    expect(settings.models).toHaveLength(2);
    expect(settings.models[0].provider).toBe("google-antigravity");
  });

  it("reads from the correct relative path", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: [] }));

    loadSettings();

    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join("/fake/extension", "settings.json"),
      "utf8"
    );
  });
});
