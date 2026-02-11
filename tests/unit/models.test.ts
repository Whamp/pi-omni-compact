import { describe, expect, it, vi } from "vitest";

import type { ModelConfig } from "../../src/settings.js";

import { resolveModel } from "../../src/models.js";

function createMockRegistry() {
  return {
    find: vi.fn(),
    getApiKey: vi.fn(),
  };
}

const testModels: ModelConfig[] = [
  { provider: "google", id: "gemini-flash", thinking: "high" },
  { provider: "google", id: "gemini-pro", thinking: "medium" },
  { provider: "openai", id: "gpt-4", thinking: "low" },
];

describe("resolveModel", () => {
  it("returns the first model with a valid API key", async () => {
    const registry = createMockRegistry();
    const mockModel = { provider: "google", id: "gemini-flash" };
    registry.find.mockReturnValue(mockModel);
    registry.getApiKey.mockResolvedValue("sk-test-key");

    const result = await resolveModel(registry as never, testModels);

    expect(result).toStrictEqual({
      provider: "google",
      model: "gemini-flash",
      thinking: "high",
      apiKey: "sk-test-key",
    });
    expect(registry.find).toHaveBeenCalledWith("google", "gemini-flash");
  });

  it("skips models not found in registry", async () => {
    const registry = createMockRegistry();
    registry.find
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ provider: "google", id: "gemini-pro" });
    registry.getApiKey.mockResolvedValue("sk-pro-key");

    const result = await resolveModel(registry as never, testModels);

    expect(result).toStrictEqual({
      provider: "google",
      model: "gemini-pro",
      thinking: "medium",
      apiKey: "sk-pro-key",
    });
    expect(registry.find).toHaveBeenCalledTimes(2);
  });

  it("skips models without an API key", async () => {
    const registry = createMockRegistry();
    const model1 = { provider: "google", id: "gemini-flash" };
    const model2 = { provider: "google", id: "gemini-pro" };
    registry.find.mockReturnValueOnce(model1).mockReturnValueOnce(model2);
    registry.getApiKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("sk-pro-key");

    const result = await resolveModel(registry as never, testModels);

    expect(result?.model).toBe("gemini-pro");
    expect(registry.getApiKey).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when no model has a valid key", async () => {
    const registry = createMockRegistry();
    registry.find.mockReturnValue({ provider: "test", id: "test" });
    registry.getApiKey.mockResolvedValue(null);

    const result = await resolveModel(registry as never, testModels);

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty model list", async () => {
    const registry = createMockRegistry();
    const result = await resolveModel(registry as never, []);
    expect(result).toBeUndefined();
  });

  it("uses the first available model, not later ones", async () => {
    const registry = createMockRegistry();
    registry.find.mockReturnValueOnce({
      provider: "google",
      id: "gemini-flash",
    });
    registry.getApiKey.mockResolvedValue("key");

    const result = await resolveModel(registry as never, testModels);

    expect(result?.model).toBe("gemini-flash");
    expect(registry.find).toHaveBeenCalledOnce();
  });
});
