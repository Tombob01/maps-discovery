/**
 * @module tests/unit/api/server.test
 * Tests for the Hono HTTP server routes.
 * Uses a mock RuntimeFacade — no network, no DB, no Playwright.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "../../../src/api/server.js";
import type { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";

// ---------------------------------------------------------------------------
// Mock facade
// ---------------------------------------------------------------------------

function makeMockFacade(): RuntimeFacade {
  return {
    expandKeyword: vi.fn().mockResolvedValue({
      original: "plumber",
      suggestions: [
        { keyword: "plumbers in Austin TX", popularity: "high", category: "local" },
      ],
    }),
    createRun: vi.fn().mockResolvedValue({ runId: "run-test-001", status: "pending" }),
    executeRun: vi.fn().mockResolvedValue({
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
    getRun: vi.fn().mockResolvedValue({
      id: "run-test-001",
      status: "complete",
      niche: "plumber",
      location: "Austin TX",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stats: {
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
    listRecords: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      hasMore: false,
    }),
  } as unknown as RuntimeFacade;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function request(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const url = `http://localhost${path}`;
  return Promise.resolve(app.fetch(
    new Request(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null,
    })));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/expand", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("returns 200 with expansion response on valid input", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/expand", { keyword: "plumber", location: "Austin TX" });
    const body = await res.json() as { ok: boolean; data: unknown };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(facade.expandKeyword).toHaveBeenCalledWith({
      keyword: "plumber",
      location: "Austin TX",
    });
  });

  it("returns 400 when keyword is missing", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/expand", { location: "Austin TX" });
    const body = await res.json() as { ok: boolean; error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 on invalid JSON", async () => {
    const app = createServer(facade);
    const res = await app.fetch(
      new Request("http://localhost/api/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("does not pass location when not provided", async () => {
    const app = createServer(facade);
    await request(app, "POST", "/api/expand", { keyword: "plumber" });
    expect(facade.expandKeyword).toHaveBeenCalledWith({ keyword: "plumber" });
  });
});

describe("POST /api/runs", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("returns 201 with runId on valid input", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs", { niche: "plumber", location: "Austin TX" });
    const body = await res.json() as { ok: boolean; data: { runId: string } };

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.runId).toBe("run-test-001");
  });

  it("returns 400 when niche is missing", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs", { location: "Austin TX" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when location is missing", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs", { niche: "plumber" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/runs/:id", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("returns 200 with run data", async () => {
    const app = createServer(facade);
    const res = await request(app, "GET", "/api/runs/run-test-001");
    const body = await res.json() as { ok: boolean; data: { id: string } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("run-test-001");
    expect(facade.getRun).toHaveBeenCalledWith("run-test-001");
  });

  it("returns 404 when facade returns null", async () => {
    const app = createServer(facade);
    vi.mocked(facade.getRun).mockResolvedValue(null);
    const res = await request(app, "GET", "/api/runs/nonexistent");
    const body = await res.json() as { ok: boolean; error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/runs/:id/records", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("returns 200 with record page", async () => {
    const app = createServer(facade);
    const res = await request(app, "GET", "/api/runs/run-test-001/records");
    const body = await res.json() as { ok: boolean; data: { items: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(facade.listRecords).toHaveBeenCalledWith("run-test-001", 1, 20);
  });

  it("passes page and pageSize from query params", async () => {
    const app = createServer(facade);
    await request(app, "GET", "/api/runs/run-001/records?page=2&pageSize=50");
    expect(facade.listRecords).toHaveBeenCalledWith("run-001", 2, 50);
  });
});

describe("POST /api/runs/:id/execute", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeMockFacade();
  });

  it("returns 202 with running status immediately", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs/run-test-001/execute", {
      provider: "mock",
      seeds: [{ keyword: "plumbers", location: "Austin TX" }],
    });
    const body = await res.json() as { ok: boolean; data: { runId: string; status: string } };

    expect(res.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.data.runId).toBe("run-test-001");
    expect(body.data.status).toBe("running");
    // Allow background microtask to complete before next test
    await new Promise(r => setTimeout(r, 0));
  });

  it("passes keyword and location to executeFromSeed", async () => {
    const app = createServer(facade);
    await request(app, "POST", "/api/runs/run-abc/execute", {
      provider: "google-maps",
      seeds: [{ keyword: "dentists", location: "Lagos, Nigeria" }],
    });
    // Drain microtask queue so background executeFromSeed fires
    await new Promise(r => setTimeout(r, 10));
    expect(facade.executeFromSeed).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "dentists",
        location: "Lagos, Nigeria",
      }),
    );
  });

  it("returns 400 when seed.keyword is missing", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs/run-001/execute", {
      provider: "mock",
      seeds: [{ keyword: "", location: "Austin TX" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when seed.location is missing", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs/run-001/execute", {
      provider: "mock",
      seeds: [{ keyword: "plumbers", location: "" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when seed is missing entirely", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs/run-001/execute", {
      provider: "mock",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/runs/:id � currentSeed", () => {
  it("returns null for currentSeed when no run is executing", async () => {
    const facade = makeMockFacade();
    const app = createServer(facade);
    const res = await request(app, "GET", "/api/runs/run-test-001");
    const body = await res.json() as { ok: boolean; data: { currentSeed: string | null } };
    expect(res.status).toBe(200);
    expect(body.data.currentSeed).toBeNull();
  });

  it("exposes currentSeed while a seed is actively executing", async () => {
    const facade = makeMockFacade();
    let resolveSeed!: () => void;
    (facade.executeFromSeed as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<void>(resolve => { resolveSeed = resolve; })
    );
    const app = createServer(facade);
    void app.request("/api/runs/run-test-001/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Austin TX" }] }),
    });
    await new Promise(r => setTimeout(r, 10));
    const res = await request(app, "GET", "/api/runs/run-test-001");
    const body = await res.json() as { ok: boolean; data: { currentSeed: string | null } };
    expect(body.data.currentSeed).toBe("plumbers");
    resolveSeed();
    await new Promise(r => setTimeout(r, 10));
  });

  it("currentSeed is null after run completes", async () => {
    const facade = makeMockFacade();
    const app = createServer(facade);
    await app.request("/api/runs/run-test-001/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Austin TX" }] }),
    });
    await new Promise(r => setTimeout(r, 20));
    const res = await request(app, "GET", "/api/runs/run-test-001");
    const body = await res.json() as { ok: boolean; data: { currentSeed: string | null } };
    expect(body.data.currentSeed).toBeNull();
  });
});

describe("POST /api/runs/:id/execute � seed failure isolation", () => {
  it("continues to seed #3 when seed #2 throws", async () => {
    const facade = makeMockFacade();
    const executionOrder: string[] = [];

    (facade.executeFromSeed as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async (_opts: { keyword: string }) => {
        executionOrder.push("plumbers");
      })
      .mockImplementationOnce(async (_opts: { keyword: string }) => {
        executionOrder.push("drain cleaning");
        throw new Error("provider crashed");
      })
      .mockImplementationOnce(async (_opts: { keyword: string }) => {
        executionOrder.push("water heater repair");
      });

    const app = createServer(facade);
    await app.request("/api/runs/run-001/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "mock",
        seeds: [
          { keyword: "plumbers", location: "Austin TX" },
          { keyword: "drain cleaning", location: "Austin TX" },
          { keyword: "water heater repair", location: "Austin TX" },
        ],
      }),
    });

    // Allow background loop to complete all three seeds
    await new Promise(r => setTimeout(r, 30));

    // All three seeds were attempted
    expect(executionOrder).toEqual(["plumbers", "drain cleaning", "water heater repair"]);
    // facade called three times despite seed #2 throwing
    expect(facade.executeFromSeed).toHaveBeenCalledTimes(3);
  });
});

describe("POST /api/runs/:id/execute � concurrency guard", () => {
  it("returns 409 when a discovery run is already in progress", async () => {
    const facade = makeMockFacade();
    // Make executeFromSeed hang so the first request never completes
    let resolveFirst: () => void;
    (facade.executeFromSeed as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<import("../../../src/runtime/RuntimeExecutor.js").ExecutionSummary>(
        (resolve) => { resolveFirst = () => resolve({ discovery: { resultsSaved: 0, jobsEnqueued: 0, resultsCollected: 0, errors: 0 }, normalization: { queriesGenerated: 0, queriesDispatched: 0, rawResultsFound: 0, recordsNormalized: 0, recordsUnique: 0, recordsDuplicate: 0, recordsExported: 0, errors: 0 } }); }
      )
    );

    const app = createServer(facade);
    const body = JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Lagos" }] });

    // Fire first request � does not await, intentionally hangs
    const first = app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });

    // Small delay to ensure first request has set isExecuting = true
    await new Promise(r => setTimeout(r, 10));

    // Fire second request while first is still running
    const second = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(second.status).toBe(409);
    const secondBody = await second.json() as { ok: boolean; error: { code: string } };
    expect(secondBody.ok).toBe(false);
    expect(secondBody.error.code).toBe("CONFLICT");

    // Clean up � resolve the first request
    resolveFirst!();
    await first;
  });

  it("accepts a new request after the previous run completes", async () => {
    const facade = makeMockFacade();
    const app = createServer(facade);
    const body = JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Lagos" }] });

    // First request completes normally
    const first = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(first.status).toBe(202);
    // Wait for background promise .finally() to reset isExecuting
    await new Promise(r => setTimeout(r, 10));
    // Second request should also succeed
    const second = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(second.status).toBe(202);
  });
});


