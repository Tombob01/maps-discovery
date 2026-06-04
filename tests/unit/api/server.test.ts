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
  return app.fetch(
    new Request(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
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

  it("returns 200 with execution summary", async () => {
    const app = createServer(facade);
    const res = await request(app, "POST", "/api/runs/run-test-001/execute", {
      provider: "mock",
      seeds: [{ keyword: "plumbers", location: "Austin TX" }],
    });
    const body = await res.json() as { ok: boolean; data: unknown };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(facade.executeFromSeed).toHaveBeenCalled();
  });

  it("passes keyword and location to executeFromSeed", async () => {
    const app = createServer(facade);
    await request(app, "POST", "/api/runs/run-abc/execute", {
      provider: "google-maps",
      seeds: [{ keyword: "dentists", location: "Lagos, Nigeria" }],
    });
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
