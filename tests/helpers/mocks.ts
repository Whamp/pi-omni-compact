/**
 * Mock factory for pi ExtensionAPI and ExtensionContext.
 */

import { vi } from "vitest";

export function createMockUI() {
  return {
    notify: vi.fn(),
    select: vi.fn(),
    confirm: vi.fn(),
    input: vi.fn(),
    setStatus: vi.fn(),
    setWorkingMessage: vi.fn(),
    setWidget: vi.fn(),
  };
}

export function createMockModelRegistry() {
  return {
    find: vi.fn(),
    getApiKey: vi.fn(),
  };
}

export function createMockContext(overrides?: Record<string, unknown>) {
  return {
    ui: createMockUI(),
    hasUI: true,
    cwd: "/tmp/test-project",
    modelRegistry: createMockModelRegistry(),
    sessionManager: {},
    model: undefined,
    isIdle: vi.fn().mockReturnValue(true),
    abort: vi.fn(),
    hasPendingMessages: vi.fn().mockReturnValue(false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn(),
    compact: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue(""),
    ...overrides,
  };
}

/**
 * Create a mock ExtensionAPI that captures registered handlers.
 */
export function createMockPi() {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)?.push(handler);
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    registerShortcut: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    registerMessageRenderer: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
    setSessionName: vi.fn(),
    getSessionName: vi.fn(),
    setLabel: vi.fn(),
    exec: vi.fn(),
    getActiveTools: vi.fn(),
    getAllTools: vi.fn(),
    setActiveTools: vi.fn(),
    getCommands: vi.fn(),
    setModel: vi.fn(),
    getThinkingLevel: vi.fn(),
    setThinkingLevel: vi.fn(),
    registerProvider: vi.fn(),
    events: {},
    _handlers: handlers,
  };
}

/**
 * Invoke a registered handler by event name.
 */
export function invokeHandler(
  pi: ReturnType<typeof createMockPi>,
  event: string,
  eventData: unknown,
  ctx: ReturnType<typeof createMockContext>
): Promise<unknown> {
  const eventHandlers = pi._handlers.get(event);
  if (!eventHandlers || eventHandlers.length === 0) {
    return Promise.reject(
      new Error(`No handler registered for event: ${event}`)
    );
  }
  return Promise.resolve(eventHandlers[0](eventData, ctx));
}
