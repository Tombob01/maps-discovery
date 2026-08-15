/**
 * tests/unit/ui/httpClient.getRun.test.ts
 *
 * Unit tests for httpClient.getRun()'s backend -> UI stats/seeds mapping.
 * Uses a mock fetch to simulate the GET /api/runs/:id API response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Run } from "../../../src/ui/types/ui.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBackendRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-test-001",
    status: "running",
    niche: "plumbers",
    location: "Austin TX",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    stats: {
      queriesGenerated: 1,
      queriesDispatched: 1,
      rawResultsFound: 10,
      recordsNormalized: 8,
      recordsUnique: 6,
      recordsDuplicate: 2,
      recordsExported: 0,
      errors: 0,
    },
    ...overrides,
  };
}

function makeGetRunResponse(overrides: Record<string, unknown> = {}) {
  return { ok: true, data: makeBackendRun(overrides) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("httpClient.getRun() -- backend to UI mapping", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function runGetRun(overrides: Record<string, unknown> = {}): Promise<Run> {
    const body = makeGetRunResponse(overrides);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      return { ok: true, json: async () => body };
    });
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");
    const run = await httpClient.getRun("run-test-001");
    return run;
  }

  it("maps seeds through when present on the backend response", async () => {
    const seeds = [
      { index: 0, keyword: "plumbers", location: "Austin TX", status: "complete" as const },
      { index: 1, keyword: "emergency plumber", location: "Austin TX", status: "running" as const },
    ];
    const run = await runGetRun({ seeds });
    expect(run.seeds).toEqual(seeds);
  });

  it("preserves seeds as null when the backend explicitly sends null", async () => {
    const run = await runGetRun({ seeds: null });
    expect(run.seeds).toBeNull();
  });

  it("leaves seeds omitted when the backend response does not include the field", async () => {
    const run = await runGetRun();
    expect(run.seeds).toBeUndefined();
  });

  it("still maps all 6 stats fields correctly", async () => {
    const run = await runGetRun();
    expect(run.stats).toEqual({
      discovered: 10,
      normalized: 8,
      failed: 0,
      duplicatesRemoved: 2,
      uniqueBusinesses: 6,
      exported: 0,
    });
  });
});