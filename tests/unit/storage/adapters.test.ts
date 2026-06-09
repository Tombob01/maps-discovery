/**
 * tests/unit/storage/adapters.test.ts
 *
 * Tests for PostgresRunServiceAdapter and PostgresRecordServiceAdapter,
 * plus the end-to-end wiring of NormalizationStage → RunLifecycleService.
 *
 * No real DB — all storage backed by in-memory stubs.
 *
 * Covers:
 *   PostgresRunServiceAdapter
 *     - findById delegates to getById
 *     - list() returns mutable Run[]
 *     - create() delegates
 *
 *   PostgresRecordServiceAdapter
 *     - findByRunId delegates to getByRunId
 *     - list() paginates client-side
 *     - list() returns empty when no runId filter
 *
 *   NormalizationStage + RunLifecycleService wiring
 *     - onSuccess callback persists record and increments stats
 *     - onSuccess failure surfaces as DEPENDENCY_UNAVAILABLE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PostgresRunServiceAdapter,
  PostgresRecordServiceAdapter,
} from "../../../src/storage/index.js";
import { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import { NormalizationStage } from "../../../src/pipeline/NormalizationStage.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type { Run } from "../../../src/core/models/Job.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { INormalizer } from "../../../src/core/interfaces/INormalizer.js";
import type {
  RunID,
  BusinessID,
  Fingerprint,
  QueryID,
} from "../../../src/core/types/common.js";
import { ok } from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

class StubRunStore implements IRunStore {
  private readonly map = new Map<string, Run>();

  seed(run: Run): void {
    this.map.set(run.id, run);
  }

  async create(run: Run): Promise<void> {
    this.map.set(run.id, run);
  }
  async getById(id: string): Promise<Run | null> {
    return this.map.get(id) ?? null;
  }
  async list(): Promise<readonly Run[]> {
    return Array.from(this.map.values());
  }
  async update(run: Run): Promise<void> {
    this.map.set(run.id, run);
  }
  async delete(id: string): Promise<boolean> {
    return this.map.delete(id);
  }
}

class StubRecordStore implements IRecordStore {
  readonly inserted: BusinessRecord[] = [];

  async insert(r: BusinessRecord): Promise<void> {
    this.inserted.push(r);
  }
  async insertMany(rs: readonly BusinessRecord[]): Promise<number> {
    this.inserted.push(...rs);
    return rs.length;
  }
  async getByRunIdPaginated(runId: string, limit: number, offset: number): Promise<readonly BusinessRecord[]> {
    const all = this.inserted.filter(r => r.runId === runId);
    return all.slice(offset, offset + limit);
  }
  async getByRunId(_id: string): Promise<readonly BusinessRecord[]> {
    return this.inserted;
  }
  async countByRunId(_id: string): Promise<number> {
    return this.inserted.length;
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN_ID = "run-adapter-001" as RunID;

function makeRun(): Run {
  return {
    id: RUN_ID,
    status: "running",
    config: {
      runId: RUN_ID,
      seeds: [
        {
          niche: "plumbers",
          location: { displayName: "Lagos", country: "NG" },
        },
      ],
      providerIds: ["google-maps"],
      forceReprocess: false,
    },
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
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
  };
}

function makeRecord(id = "biz-001"): BusinessRecord {
  return {
    id: id as BusinessID,
    fingerprint: `fp-${id}` as Fingerprint,
    externalIds: { googlePlaceId: id },
    name: "Test Biz",
    normalizedName: "test biz",
    address: {
      raw: "1 Main St",
      street: "1 Main St",
      city: "Lagos",
      state: null,
      postalCode: null,
      country: "NG",
      countryCode: "NG",
    },
    geo: null,
    phone: null,
    normalizedPhone: null,
    website: null,
    categories: [],
    primaryCategory: null,
    rating: null,
    reviewCount: null,
    hours: null,
    priceLevel: null,
    sourceProvider: "google-maps",
    sourceUrl: null,
    collectedAt: new Date(),
    runId: RUN_ID,
    queryId: "q-1" as QueryID,
    normalizationStatus: "complete",
    deduplicationStatus: "unique",
    exportStatus: "pending",
  };
}

function makeProviderResult(): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: "prov-001",
    rawPayload: { name: "Test Biz" },
    sourceUrl: null,
    collectedAt: new Date(),
    runId: RUN_ID,
    queryId: "q-1" as QueryID,
    resumeToken: {
      strategy: "cursor",
      pageRequest: { kind: "cursor", cursor: "abc" },
      createdAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// PostgresRunServiceAdapter
// ---------------------------------------------------------------------------

describe("PostgresRunServiceAdapter", () => {
  let runStore: StubRunStore;
  let adapter: PostgresRunServiceAdapter;

  beforeEach(() => {
    runStore = new StubRunStore();
    adapter = new PostgresRunServiceAdapter(runStore);
  });

  it("findById delegates to getById and returns Run", async () => {
    const run = makeRun();
    runStore.seed(run);
    const found = await adapter.findById(RUN_ID);
    expect(found).toEqual(run);
  });

  it("findById returns null for unknown id", async () => {
    const found = await adapter.findById("nonexistent");
    expect(found).toBeNull();
  });

  it("create delegates to store.create", async () => {
    const run = makeRun();
    await adapter.create(run);
    const stored = await runStore.getById(RUN_ID);
    expect(stored).toEqual(run);
  });

  it("list() returns a mutable Run[] (not readonly)", async () => {
    runStore.seed(makeRun());
    const result = await adapter.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    // Verify it's mutable (TypeScript-level contract; push should not throw)
    expect(() => result.push(makeRun())).not.toThrow();
  });

  it("list() returns all runs", async () => {
    const r1 = makeRun();
    const r2 = { ...makeRun(), id: "run-2" as RunID };
    runStore.seed(r1);
    runStore.seed(r2);
    const result = await adapter.list();
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PostgresRecordServiceAdapter
// ---------------------------------------------------------------------------

describe("PostgresRecordServiceAdapter", () => {
  let recordStore: StubRecordStore;
  let adapter: PostgresRecordServiceAdapter;

  beforeEach(() => {
    recordStore = new StubRecordStore();
    adapter = new PostgresRecordServiceAdapter(recordStore);
  });

  it("findByRunId delegates to getByRunId", async () => {
    const record = makeRecord();
    await recordStore.insertMany([record]);
    const found = await adapter.findByRunId(RUN_ID);
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(record.id);
  });

  it("list() returns empty items when no runId given", async () => {
    const { items, total } = await adapter.list({});
    expect(items).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("list() paginates client-side", async () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord(`biz-${i}`));
    await recordStore.insertMany(records);

    const page1 = await adapter.list({ runId: RUN_ID, page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await adapter.list({ runId: RUN_ID, page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(2);

    const page3 = await adapter.list({ runId: RUN_ID, page: 3, pageSize: 2 });
    expect(page3.items).toHaveLength(1);
  });

  it("list() total reflects all records not just page", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord(`biz-${i}`),
    );
    await recordStore.insertMany(records);
    const { total } = await adapter.list({
      runId: RUN_ID,
      page: 1,
      pageSize: 3,
    });
    expect(total).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: NormalizationStage → RunLifecycleService wiring
// ---------------------------------------------------------------------------

describe("NormalizationStage + RunLifecycleService — end-to-end write path", () => {
  it("onSuccess persists record and increments recordsNormalized", async () => {
    const runStore = new StubRunStore();
    const recordStore = new StubRecordStore();
    runStore.seed(makeRun());

    const lifecycle = new RunLifecycleService(runStore, recordStore);
    const record = makeRecord();
    const providerResult = makeProviderResult();

    // Mock normalizer that always returns our fixture record
    const normalizer: INormalizer = {
      normalize: vi.fn().mockResolvedValue(ok(record)),
    };

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (_id) => providerResult,
      onSuccess: async (normalized, payload) => {
        await lifecycle.persistRecords([normalized]);
        await lifecycle.incrementStats(payload.runId, {
          recordsNormalized: 1,
        });
      },
    });

    const result = await stage.execute(
      {
        runId: RUN_ID,
        queryId: "q-1" as QueryID,
        rawResultId:
          "prov-001" as import("../../../src/core/types/common.js").UUID,
        providerId: "google-maps",
      },
      { runId: RUN_ID, stageId: "stage-1", attempt: 1 },
    );

    // Stage returned success
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.skipped).toBeUndefined();
    }

    // Record was persisted
    expect(recordStore.inserted).toHaveLength(1);
    expect(recordStore.inserted[0]?.id).toBe(record.id);

    // Stats were incremented
    const updatedRun = await runStore.getById(RUN_ID);
    expect(updatedRun?.stats.recordsNormalized).toBe(1);
  });

  it("onSuccess failure surfaces as DEPENDENCY_UNAVAILABLE stage error", async () => {
    const runStore = new StubRunStore();
    runStore.seed(makeRun());

    const normalizer: INormalizer = {
      normalize: vi.fn().mockResolvedValue(ok(makeRecord())),
    };

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async () => makeProviderResult(),
      onSuccess: async () => {
        throw new Error("DB connection lost");
      },
    });

    const result = await stage.execute(
      {
        runId: RUN_ID,
        queryId: "q-1" as QueryID,
        rawResultId:
          "prov-001" as import("../../../src/core/types/common.js").UUID,
        providerId: "google-maps",
      },
      { runId: RUN_ID, stageId: "stage-1", attempt: 1 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toContain("DB connection lost");
    }
  });

  it("missing raw result skips gracefully without persisting", async () => {
    const recordStore = new StubRecordStore();
    const persistSpy = vi.fn();

    const stage = new NormalizationStage(
      { normalize: vi.fn() },
      {
        fetchRawResult: async () => null,
        onSuccess: persistSpy,
      },
    );

    const result = await stage.execute(
      {
        runId: RUN_ID,
        queryId: "q-1" as QueryID,
        rawResultId:
          "nonexistent" as import("../../../src/core/types/common.js").UUID,
        providerId: "google-maps",
      },
      { runId: RUN_ID, stageId: "stage-1", attempt: 1 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(true);
    }
    expect(persistSpy).not.toHaveBeenCalled();
    expect(recordStore.inserted).toHaveLength(0);
  });
});
