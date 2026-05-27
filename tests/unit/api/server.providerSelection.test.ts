/**
 * @module tests/unit/api/server.providerSelection
 *
 * Smoke tests for provider routing in POST /api/runs/:id/execute.
 *
 * Verifies that:
 *   1. When provider: "google-maps" is sent AND a real provider is injected,
 *      executeFromSeed receives the injected provider instance.
 *   2. When provider: "mock" is sent (or the injected provider is absent),
 *      executeFromSeed receives the fallback mock provider (not the injected one).
 *   3. The optional second arg to createServer() preserves backward compat —
 *      calling createServer(facade) with no provider still works.
 *
 * No Playwright browser is launched. The "real" provider is a plain mock
 * object that satisfies the IProvider interface.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "../../../src/api/server.js";
import type { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";
import type { IProvider } from "../../../src/core/interfaces/IProvider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockFacade(): RuntimeFacade {
  return {
    expandKeyword: vi.fn(),
    createRun: vi.fn(),
    executeRun: vi.fn(),
    executeFromSeed: vi.fn().mockResolvedValue({
      discovery: { resultsSaved: 0, jobsEnqueued: 0 },
      normalization: {
        queriesGenerated: 0,
        queriesDispatched: 0,
        rawResultsFound: 0,
        recordsNormalized: 0,
        recordsUnique: 0,
        recordsDuplicate: 0,
        recordsExported: 0,
        errors: 0,
      },
    }),
    getRun: vi.fn(),
    listRecords: vi.fn(),
  } as unknown as RuntimeFacade;
}

/** A minimal IProvider stand-in — no browser, no Playwright. */
function makeFakeRealProvider(id = "google-maps"): IProvider {
  return {
    id,
    displayName: "Google Maps (test stub)",
    capabilities: {
      supportsGeoFilter: true,
      supportsResultCount: false,
      supportsHours: true,
      supportsPriceLevel: true,
      supportsCoordinates: true,
      maxResultsPerQuery: 120,
    },
    policy: {
      rateLimit: {
        requestsPerMinute: 2,
        minDelayBetweenRequestsMs: 3000,
        jitterMs: 2000,
        maxConcurrent: 1,
      },
      retry: {
        maxAttempts: 3,
        backoffStrategy: "exponential" as const,
        backoffBaseMs: 5000,
        backoffCapMs: 60000,
        retryableStatusCodes: [],
      },
      browser: {
        headless: true,
        recordHar: false,
        userAgent: null,
        viewport: { width: 1280, height: 800 },
        timeoutMs: 30000,
        slowMoMs: 0,
        locale: "en-US",
        timezoneId: "UTC",
      },
      conservativeMode: false,
    },
    checkHealth: vi.fn().mockResolvedValue({ status: "healthy" as const }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    discover: async function* () { /* yields nothing */ },
  };
}

function executeRequest(
  app: ReturnType<typeof createServer>,
  runId: string,
  body: unknown,
): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost/api/runs/${runId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createServer provider selection — POST /api/runs/:id/execute", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("routes provider:'google-maps' to the injected provider instance", async () => {
    const realProvider = makeFakeRealProvider("google-maps");
    const app = createServer(facade, realProvider);

    await executeRequest(app, "run-001", {
      provider: "google-maps",
      seed: { keyword: "dentists", location: "Lagos" },
    });

    expect(facade.executeFromSeed).toHaveBeenCalledOnce();
    const call = vi.mocked(facade.executeFromSeed).mock.calls[0]![0];
    // The provider passed to executeFromSeed must BE the injected instance
    expect(call.provider).toBe(realProvider);
    expect(call.provider.id).toBe("google-maps");
  });

  it("falls back to mock provider when provider:'mock' is sent, even with injected provider", async () => {
    const realProvider = makeFakeRealProvider("google-maps");
    const app = createServer(facade, realProvider);

    await executeRequest(app, "run-002", {
      provider: "mock",
      seed: { keyword: "plumbers", location: "Austin TX" },
    });

    expect(facade.executeFromSeed).toHaveBeenCalledOnce();
    const call = vi.mocked(facade.executeFromSeed).mock.calls[0]![0];
    // Must NOT be the injected real provider
    expect(call.provider).not.toBe(realProvider);
    expect(call.provider.id).toBe("mock");
  });

  it("falls back to mock when provider:'google-maps' but no provider injected", async () => {
    // createServer called with no second arg — backward-compat path
    const app = createServer(facade);

    await executeRequest(app, "run-003", {
      provider: "google-maps",
      seed: { keyword: "lawyers", location: "Ibadan" },
    });

    expect(facade.executeFromSeed).toHaveBeenCalledOnce();
    const call = vi.mocked(facade.executeFromSeed).mock.calls[0]![0];
    // Falls back to buildMockProvider("google-maps")
    expect(call.provider).not.toBe(undefined);
    expect(call.provider.id).toBe("google-maps");
  });

  it("passes keyword and location correctly regardless of provider choice", async () => {
    const realProvider = makeFakeRealProvider();
    const app = createServer(facade, realProvider);

    await executeRequest(app, "run-004", {
      provider: "google-maps",
      seed: { keyword: "  restaurants  ", location: "  Abuja  " },
    });

    const call = vi.mocked(facade.executeFromSeed).mock.calls[0]![0];
    // Leading/trailing whitespace must be trimmed
    expect(call.keyword).toBe("restaurants");
    expect(call.location).toBe("Abuja");
  });

  it("createServer() with no second arg is backward compatible (existing tests unaffected)", async () => {
    // Calling createServer with one arg must not throw at construction time
    expect(() => createServer(facade)).not.toThrow();
  });
});
