/**
 * tests/unit/storage/RunLifecycleService.test.ts
 *
 * Integration tests for RunLifecycleService.
 * Uses in-memory stub implementations of IRunStore and IRecordStore —
 * no real Postgres connection required.
 *
 * Covers:
 *   - start()          → status "running", startedAt set
 *   - complete()       → status "complete", completedAt set, stats replaced
 *   - fail()           → status "failed", stats merged
 *   - incrementStats() → additive delta applied, status unchanged
 *   - persistRecords() → batches writes, returns total count
 *   - persistRecords() with empty array → no-op
 *   - Error paths      → throws when run not found
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type { Run, RunStats } from "../../../src/core/models/Job.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type {
  RunID,
  BusinessID,
  Fingerprint,
  QueryID,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Stub IRunStore — in-memory map
// ---------------------------------------------------------------------------

class StubRunStore implements IRunStore {
  private readonly store = new Map<string, Run>();
  readonly updateCalls: Run[] = [];

  seed(run: Run): void {
    this.store.set(run.id, run);
  }

  async create(run: Run): Promise<void> {
    this.store.set(run.id, run);
  }

  async getById(runId: string): Promise<Run | null> {
    return this.store.get(runId) ?? null;
  }

  async list(): Promise<readonly Run[]> {
    return Array.from(this.store.values());
  }

  async update(run: Run): Promise<void> {
    this.store.set(run.id, run);
    this.updateCalls.push(run);
  }

  async delete(runId: string): Promise<boolean> {
    return this.store.delete(runId);
  }
}

// ---------------------------------------------------------------------------
// Stub IRecordStore — records batches for inspection
// ---------------------------------------------------------------------------

class StubRecordStore implements IRecordStore {
  readonly insertedBatches: BusinessRecord[][] = [];

  async insert(record: BusinessRecord): Promise<void> {
    this.insertedBatches.push([record]);
  }

  async insertMany(records: readonly BusinessRecord[]): Promise<void> {
    this.insertedBatches.push([...records]);
  }

  async getByRunId(_runId: string): Promise<readonly BusinessRecord[]> {
    return this.insertedBatches.flat();
  }

  async countByRunId(_runId: string): Promise<number> {
    return this.insertedBatches.flat().length;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = "run-test-001" as RunID;

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: RUN_ID,
    status: "pending",
    config: {
      runId: RUN_ID,
      seeds: [
        {
          niche: "plumbers",
          location: { displayName: "Lagos, Nigeria", country: "NG" },
        },
      ],
      providerIds: ["google-maps"],
      forceReprocess: false,
    },
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
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

function makeRecord(id: string): BusinessRecord {
  return {
    id: id as BusinessID,
    fingerprint: `fp-${id}` as Fingerprint,
    externalIds: { googlePlaceId: id },
    name: `Business ${id}`,
    normalizedName: `business ${id}`,
    address: {
      raw: "123 Main St, Lagos",
      street: "123 Main St",
      city: "Lagos",
      state: null,
      postalCode: null,
      country: "Nigeria",
      countryCode: "NG",
    },
    geo: { lat: 6.5244, lng: 3.3792 },
    phone: "+2348012345678",
    normalizedPhone:
      "+2348012345678" as import("../../../src/core/types/common.js").E164Phone,
    website: null,
    categories: ["plumbing"],
    primaryCategory: "plumbing",
    rating: 4.5,
    reviewCount: 12,
    hours: null,
    priceLevel: null,
    sourceProvider: "google-maps",
    sourceUrl: null,
    collectedAt: new Date("2024-01-01T10:00:00Z"),
    runId: RUN_ID,
    queryId: "query-1" as QueryID,
    normalizationStatus: "complete",
    deduplicationStatus: "unique",
    exportStatus: "pending",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunLifecycleService — start()", () => {
  let runStore: StubRunStore;
  let recordStore: StubRecordStore;
  let service: RunLifecycleService;

  beforeEach(() => {
    runStore = new StubRunStore();
    recordStore = new StubRecordStore();
    service = new RunLifecycleService(runStore, recordStore);
  });

  it("transitions status from pending to running", async () => {
    runStore.seed(makeRun());
    const updated = await service.start(RUN_ID);
    expect(updated.status).toBe("running");
  });

  it("sets startedAt when it was null", async () => {
    runStore.seed(makeRun({ startedAt: null }));
    const before = Date.now();
    const updated = await service.start(RUN_ID);
    const after = Date.now();
    expect(updated.startedAt).toBeInstanceOf(Date);
    expect(updated.startedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated.startedAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it("preserves existing startedAt if already set", async () => {
    const existingStart = new Date("2024-01-01T09:00:00Z");
    runStore.seed(makeRun({ startedAt: existingStart }));
    const updated = await service.start(RUN_ID);
    expect(updated.startedAt).toEqual(existingStart);
  });

  it("calls runStore.update() exactly once", async () => {
    runStore.seed(makeRun());
    await service.start(RUN_ID);
    expect(runStore.updateCalls).toHaveLength(1);
  });

  it("throws when run does not exist", async () => {
    await expect(service.start("nonexistent" as RunID)).rejects.toThrow(
      'run "nonexistent" not found',
    );
  });
});

describe("RunLifecycleService — complete()", () => {
  let runStore: StubRunStore;
  let service: RunLifecycleService;

  beforeEach(() => {
    runStore = new StubRunStore();
    service = new RunLifecycleService(runStore, new StubRecordStore());
  });

  it("transitions status to complete", async () => {
    runStore.seed(makeRun({ status: "running" }));
    const finalStats: RunStats = {
      queriesGenerated: 5,
      queriesDispatched: 5,
      rawResultsFound: 42,
      recordsNormalized: 40,
      recordsUnique: 38,
      recordsDuplicate: 2,
      recordsExported: 38,
      errors: 0,
    };
    const updated = await service.complete(RUN_ID, finalStats);
    expect(updated.status).toBe("complete");
  });

  it("sets completedAt to now", async () => {
    runStore.seed(makeRun({ status: "running" }));
    const before = Date.now();
    const updated = await service.complete(RUN_ID, makeRun().stats);
    expect(updated.completedAt).toBeInstanceOf(Date);
    expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("replaces stats with the provided finalStats", async () => {
    runStore.seed(makeRun({ status: "running" }));
    const finalStats: RunStats = {
      queriesGenerated: 10,
      queriesDispatched: 10,
      rawResultsFound: 100,
      recordsNormalized: 95,
      recordsUnique: 90,
      recordsDuplicate: 5,
      recordsExported: 90,
      errors: 1,
    };
    const updated = await service.complete(RUN_ID, finalStats);
    expect(updated.stats).toEqual(finalStats);
  });

  it("throws when run does not exist", async () => {
    await expect(
      service.complete("ghost" as RunID, makeRun().stats),
    ).rejects.toThrow('run "ghost" not found');
  });
});

describe("RunLifecycleService — fail()", () => {
  let runStore: StubRunStore;
  let service: RunLifecycleService;

  beforeEach(() => {
    runStore = new StubRunStore();
    service = new RunLifecycleService(runStore, new StubRecordStore());
  });

  it("transitions status to failed", async () => {
    runStore.seed(makeRun({ status: "running" }));
    const updated = await service.fail(RUN_ID);
    expect(updated.status).toBe("failed");
  });

  it("sets completedAt when it was null", async () => {
    runStore.seed(makeRun({ status: "running", completedAt: null }));
    const updated = await service.fail(RUN_ID);
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("preserves existing completedAt if already set", async () => {
    const existing = new Date("2024-01-01T12:00:00Z");
    runStore.seed(makeRun({ status: "running", completedAt: existing }));
    const updated = await service.fail(RUN_ID);
    expect(updated.completedAt).toEqual(existing);
  });

  it("merges partialStats additively onto current stats", async () => {
    runStore.seed(
      makeRun({
        status: "running",
        stats: { ...makeRun().stats, rawResultsFound: 10, errors: 1 },
      }),
    );
    const updated = await service.fail(RUN_ID, {
      errors: 2,
      rawResultsFound: 5,
    });
    expect(updated.stats.errors).toBe(3);
    expect(updated.stats.rawResultsFound).toBe(15);
  });

  it("keeps current stats unchanged when no partialStats given", async () => {
    const stats: RunStats = { ...makeRun().stats, recordsNormalized: 7 };
    runStore.seed(makeRun({ status: "running", stats }));
    const updated = await service.fail(RUN_ID);
    expect(updated.stats.recordsNormalized).toBe(7);
  });

  it("throws when run does not exist", async () => {
    await expect(service.fail("missing" as RunID)).rejects.toThrow(
      'run "missing" not found',
    );
  });
});

describe("RunLifecycleService — incrementStats()", () => {
  let runStore: StubRunStore;
  let service: RunLifecycleService;

  beforeEach(() => {
    runStore = new StubRunStore();
    service = new RunLifecycleService(runStore, new StubRecordStore());
  });

  it("adds delta values to existing stats", async () => {
    runStore.seed(makeRun({ status: "running" }));
    await service.incrementStats(RUN_ID, {
      recordsNormalized: 5,
      rawResultsFound: 10,
    });
    const run = await runStore.getById(RUN_ID);
    expect(run?.stats.recordsNormalized).toBe(5);
    expect(run?.stats.rawResultsFound).toBe(10);
  });

  it("does not change run status", async () => {
    runStore.seed(makeRun({ status: "running" }));
    const updated = await service.incrementStats(RUN_ID, { errors: 1 });
    expect(updated.status).toBe("running");
  });

  it("partial delta leaves other counters unchanged", async () => {
    runStore.seed(
      makeRun({
        status: "running",
        stats: { ...makeRun().stats, recordsExported: 3 },
      }),
    );
    await service.incrementStats(RUN_ID, { errors: 1 });
    const run = await runStore.getById(RUN_ID);
    expect(run?.stats.recordsExported).toBe(3);
    expect(run?.stats.errors).toBe(1);
  });

  it("throws when run does not exist", async () => {
    await expect(
      service.incrementStats("ghost" as RunID, { errors: 1 }),
    ).rejects.toThrow('run "ghost" not found');
  });
});

describe("RunLifecycleService — persistRecords()", () => {
  let recordStore: StubRecordStore;
  let service: RunLifecycleService;

  beforeEach(() => {
    recordStore = new StubRecordStore();
    service = new RunLifecycleService(new StubRunStore(), recordStore, {
      batchSize: 3,
    });
  });

  it("returns 0 and makes no calls for empty input", async () => {
    const count = await service.persistRecords([]);
    expect(count).toBe(0);
    expect(recordStore.insertedBatches).toHaveLength(0);
  });

  it("returns total record count", async () => {
    const records = [makeRecord("a"), makeRecord("b"), makeRecord("c")];
    const count = await service.persistRecords(records);
    expect(count).toBe(3);
  });

  it("splits into batches of batchSize", async () => {
    const records = Array.from({ length: 7 }, (_, i) => makeRecord(`r${i}`));
    await service.persistRecords(records);
    // batchSize=3: batches of 3, 3, 1
    expect(recordStore.insertedBatches).toHaveLength(3);
    expect(recordStore.insertedBatches[0]).toHaveLength(3);
    expect(recordStore.insertedBatches[1]).toHaveLength(3);
    expect(recordStore.insertedBatches[2]).toHaveLength(1);
  });

  it("single batch when records <= batchSize", async () => {
    const records = [makeRecord("x"), makeRecord("y")];
    await service.persistRecords(records);
    expect(recordStore.insertedBatches).toHaveLength(1);
    expect(recordStore.insertedBatches[0]).toHaveLength(2);
  });

  it("preserves all record IDs across batches", async () => {
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    const records = ids.map(makeRecord);
    await service.persistRecords(records);
    const allInserted = recordStore.insertedBatches.flat();
    expect(allInserted.map((r) => r.id)).toEqual(ids);
  });
});
