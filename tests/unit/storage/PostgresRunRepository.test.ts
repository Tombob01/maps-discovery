/**
 * tests/unit/storage/PostgresRunRepository.test.ts
 *
 * Unit tests for PostgresRunRepository.listStaleRunning().
 * All tests mock PostgresClient.query - no real DB required.
 *
 * This is direct regression coverage for KI-8: stale-run selection was
 * moved from in-memory filtering over a capped list() result to a
 * dedicated SQL-level query with no row limit. These tests assert the
 * query is built correctly and that results are never truncated.
 */

import { describe, it, expect, vi } from "vitest";
import { PostgresRunRepository } from "../../../src/storage/PostgresRunRepository.js";
import type { PostgresClient, Row } from "../../../src/storage/PostgresClient.js";
import type { RunID } from "../../../src/core/types/common.js";

interface CapturedQuery {
  sql: string;
  params: readonly unknown[] | undefined;
}

function makeClient(rows: Row[] = [], rowCount = rows.length): {
  client: PostgresClient;
  captured: CapturedQuery[];
} {
  const captured: CapturedQuery[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      captured.push({ sql, params });
      return { rows, rowCount };
    }),
  } as unknown as PostgresClient;
  return { client, captured };
}

function makeRunRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "run-001",
    status: "running",
    config: { runId: "run-001", seeds: [], providerIds: [], forceReprocess: false },
    started_at: new Date("2026-01-01T00:00:00Z"),
    completed_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
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
    ...overrides,
  };
}

const CUTOFF = new Date("2026-06-01T00:00:00Z");

describe("PostgresRunRepository.listStaleRunning — query construction", () => {
  it("sends a WHERE clause filtering on status = 'running'", async () => {
    const { client, captured } = makeClient([]);
    const repo = new PostgresRunRepository(client);
    await repo.listStaleRunning(CUTOFF);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.sql).toContain("status = 'running'");
  });

  it("sends a WHERE clause excluding null started_at", async () => {
    const { client, captured } = makeClient([]);
    const repo = new PostgresRunRepository(client);
    await repo.listStaleRunning(CUTOFF);
    expect(captured[0]?.sql).toContain("started_at IS NOT NULL");
  });

  it("sends a WHERE clause comparing started_at against the cutoff parameter", async () => {
    const { client, captured } = makeClient([]);
    const repo = new PostgresRunRepository(client);
    await repo.listStaleRunning(CUTOFF);
    expect(captured[0]?.sql).toContain("started_at <");
    expect(captured[0]?.params).toEqual([CUTOFF]);
  });

  it("does not send a LIMIT clause", async () => {
    const { client, captured } = makeClient([]);
    const repo = new PostgresRunRepository(client);
    await repo.listStaleRunning(CUTOFF);
    expect(captured[0]?.sql).not.toContain("LIMIT");
  });
});

describe("PostgresRunRepository.listStaleRunning — result mapping", () => {
  it("maps a returned row to a Run with status 'running'", async () => {
    const row = makeRunRow({ id: "run-stale-1" });
    const { client } = makeClient([row]);
    const repo = new PostgresRunRepository(client);
    const result = await repo.listStaleRunning(CUTOFF);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("run-stale-1" as RunID);
    expect(result[0]?.status).toBe("running");
  });

  it("returns an empty array when no rows qualify", async () => {
    const { client } = makeClient([]);
    const repo = new PostgresRunRepository(client);
    const result = await repo.listStaleRunning(CUTOFF);
    expect(result).toEqual([]);
  });
});

describe("PostgresRunRepository.listStaleRunning — KI-8 regression: unbounded result set", () => {
  it("returns more than 100 qualifying rows without truncation", async () => {
    const manyRows = Array.from({ length: 150 }, (_, i) =>
      makeRunRow({ id: `run-stale-${i}` }),
    );
    const { client } = makeClient(manyRows, manyRows.length);
    const repo = new PostgresRunRepository(client);
    const result = await repo.listStaleRunning(CUTOFF);
    expect(result).toHaveLength(150);
    expect(result.every((r) => r.status === "running")).toBe(true);
  });

  it("calls query exactly once regardless of result set size (no pagination/chunking)", async () => {
    const manyRows = Array.from({ length: 150 }, (_, i) =>
      makeRunRow({ id: `run-stale-${i}` }),
    );
    const { client, captured } = makeClient(manyRows, manyRows.length);
    const repo = new PostgresRunRepository(client);
    await repo.listStaleRunning(CUTOFF);
    expect(captured).toHaveLength(1);
  });
});