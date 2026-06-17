/**
 * tests/unit/pipeline/RunCoordinator.test.ts
 *
 * Unit tests for RunCoordinator.
 * All dependencies are in-memory stubs - no real DB, no real queue.
 *
 * Covers:
 *   - execute() transitions run pending -> running -> complete
 *   - execute() transitions run pending -> running -> failed on drain error
 *   - onSuccess persists each record via lifecycle.persistRecords
 *   - onSuccess increments recordsNormalized and rawResultsFound
 *   - final stats passed to lifecycle.complete() reflect all processed jobs
 *   - runner stats (failures) are folded into accumulated.errors
 *   - execute() re-throws after persisting failed status
 *   - idempotent record persistence (duplicate inserts silently skipped)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunCoordinator } from "../../../src/pipeline/RunCoordinator.js";
import { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type {
  Run,
  RunStats,
  NormalizationJobPayload,
} from "../../../src/core/models/Job.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type {
  RunID,
  QueryID,
  UUID,
  BusinessID,
  Fingerprint,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

class StubRunStore implements IRunStore {
  private readonly map = new Map<string, Run>();
  readonly updates: Run[] = [];

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
    return [...this.map.values()];
  }
  async listStaleRunning(olderThan: Date): Promise<readonly Run[]> {
    return [...this.map.values()].filter(
      (r) =>
        r.status === "running" &&
        r.startedAt !== null &&
        r.startedAt.getTime() < olderThan.getTime(),
    );
  }
  async update(run: Run): Promise<void> {
    this.map.set(run.id, run);
    this.updates.push(run);
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
  async getByRunId(_id: string): Promise<readonly BusinessRecord[]> {
    return this.inserted;
  }
  async countByRunId(_id: string): Promise<number> {
    return this.inserted.length;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = "run-coord-001" as RunID;

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: RUN_ID,
    status: "pending",
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

function makeProviderResult(name = "Ace Plumbers"): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: `place-${name}`,
    rawPayload: {
      name,
      city: "Lagos",
      country: "Nigeria",
      address: "1 Main St",
    },
    sourceUrl: null,
    collectedAt: new Date("2024-01-01T10:00:00Z"),
    runId: RUN_ID,
    queryId: "q-1" as QueryID,
    resumeToken: {
      strategy: "cursor",
      pageRequest: { kind: "cursor", cursor: "abc" },
      createdAt: Date.now(),
    },
  };
}

function makeJobPayload(rawResultId: string): NormalizationJobPayload {
  return {
    runId: RUN_ID,
    queryId: "q-1" as QueryID,
    rawResultId: rawResultId as UUID,
    providerId: "google-maps",
  };
}

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function makeCoordinator(
  runStore: StubRunStore,
  recordStore: StubRecordStore,
  queue: InMemoryQueue<NormalizationJobPayload>,
  rawStore: Map<string, ProviderResult>,
) {
  const lifecycle = new RunLifecycleService(runStore, recordStore);
  const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
  return new RunCoordinator(lifecycle, normalizer, queue, {
    fetchRawResult: async (id) => rawStore.get(id) ?? null,
    pollIntervalMs: 0,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunCoordinator - lifecycle transitions", () => {
  let runStore: StubRunStore;
  let recordStore: StubRecordStore;

  beforeEach(() => {
    runStore = new StubRunStore();
    recordStore = new StubRecordStore();
  });

  it("transitions run from pending to running then complete", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map<string, ProviderResult>();
    const coordinator = makeCoordinator(runStore, recordStore, queue, rawStore);

    await coordinator.execute(RUN_ID);

    const finalRun = await runStore.getById(RUN_ID);
    expect(finalRun?.status).toBe("complete");
    expect(finalRun?.completedAt).toBeInstanceOf(Date);
    expect(finalRun?.startedAt).toBeInstanceOf(Date);
  });

  it("sets startedAt during execute()", async () => {
    runStore.seed(makeRun({ startedAt: null }));
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const coordinator = makeCoordinator(
      runStore,
      recordStore,
      queue,
      new Map(),
    );

    const before = Date.now();
    await coordinator.execute(RUN_ID);
    const after = Date.now();

    const run = await runStore.getById(RUN_ID);
    expect(run?.startedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(run?.startedAt?.getTime()).toBeLessThanOrEqual(after);
  });

  it("transitions to failed and re-throws when drain throws", async () => {
    runStore.seed(makeRun());

    // Queue that throws on dequeue � depth() must return a valid Result
    // so PipelineRunner.drain() can log before entering the dequeue loop.
    const badQueue = {
      name: "bad",
      enqueue: vi.fn(),
      dequeue: vi.fn().mockRejectedValue(new Error("queue crashed")),
      ack: vi.fn(),
      nack: vi.fn(),
      depth: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    } as unknown as InMemoryQueue<NormalizationJobPayload>;

    const lifecycle = new RunLifecycleService(runStore, recordStore);
    const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
    const coordinator = new RunCoordinator(lifecycle, normalizer, badQueue, {
      fetchRawResult: async () => null,
      pollIntervalMs: 0,
    });

    await expect(coordinator.execute(RUN_ID)).rejects.toThrow("queue crashed");

    const run = await runStore.getById(RUN_ID);
    expect(run?.status).toBe("failed");
  });

  it("throws when run does not exist", async () => {
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const coordinator = makeCoordinator(
      runStore,
      recordStore,
      queue,
      new Map(),
    );
    await expect(coordinator.execute("nonexistent" as RunID)).rejects.toThrow(
      "not found",
    );
  });
});

describe("RunCoordinator - record persistence", () => {
  let runStore: StubRunStore;
  let recordStore: StubRecordStore;

  beforeEach(() => {
    runStore = new StubRunStore();
    recordStore = new StubRecordStore();
  });

  it("persists one record per successful normalization job", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map<string, ProviderResult>([
      ["raw-1", makeProviderResult("Ace Plumbers")],
    ]);

    await queue.enqueue(makeJobPayload("raw-1"));

    const coordinator = makeCoordinator(runStore, recordStore, queue, rawStore);
    await coordinator.execute(RUN_ID);

    expect(recordStore.inserted).toHaveLength(1);
    expect(recordStore.inserted[0]?.name).toBe("Ace Plumbers");
  });

  it("persists all records when multiple jobs are queued", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map<string, ProviderResult>([
      ["raw-1", makeProviderResult("Biz One")],
      ["raw-2", makeProviderResult("Biz Two")],
      ["raw-3", makeProviderResult("Biz Three")],
    ]);

    await queue.enqueue(makeJobPayload("raw-1"));
    await queue.enqueue(makeJobPayload("raw-2"));
    await queue.enqueue(makeJobPayload("raw-3"));

    const coordinator = makeCoordinator(runStore, recordStore, queue, rawStore);
    await coordinator.execute(RUN_ID);

    expect(recordStore.inserted).toHaveLength(3);
    const names = recordStore.inserted.map((r) => r.name).sort();
    expect(names).toEqual(["Biz One", "Biz Three", "Biz Two"]);
  });

  it("skips missing raw results without failing the run", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    await queue.enqueue(makeJobPayload("nonexistent"));

    const coordinator = makeCoordinator(
      runStore,
      recordStore,
      queue,
      new Map(),
    );
    await coordinator.execute(RUN_ID);

    expect(recordStore.inserted).toHaveLength(0);
    const run = await runStore.getById(RUN_ID);
    expect(run?.status).toBe("complete");
  });
});

describe("RunCoordinator - stats tracking", () => {
  let runStore: StubRunStore;
  let recordStore: StubRecordStore;

  beforeEach(() => {
    runStore = new StubRunStore();
    recordStore = new StubRecordStore();
  });

  it("increments recordsNormalized in final stats", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map<string, ProviderResult>([
      ["raw-1", makeProviderResult("Ace Plumbers")],
      ["raw-2", makeProviderResult("Best Electric")],
    ]);
    await queue.enqueue(makeJobPayload("raw-1"));
    await queue.enqueue(makeJobPayload("raw-2"));

    const coordinator = makeCoordinator(runStore, recordStore, queue, rawStore);
    const stats = await coordinator.execute(RUN_ID);

    expect(stats.recordsNormalized).toBe(2);
    expect(stats.rawResultsFound).toBe(2);
    expect(stats.recordsUnique).toBe(2);
    expect(stats.recordsDuplicate).toBe(0);
  });

  it("final run in store has correct stats", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map([["r1", makeProviderResult("X")]]);
    await queue.enqueue(makeJobPayload("r1"));

    const coordinator = makeCoordinator(runStore, recordStore, queue, rawStore);
    await coordinator.execute(RUN_ID);

    const run = await runStore.getById(RUN_ID);
    expect(run?.stats.recordsNormalized).toBe(1);
  });

  it("folded runner failures into errors counter", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm", {
      defaultMaxAttempts: 1,
    });

    const lifecycle = new RunLifecycleService(runStore, recordStore);
    const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
    const coordinator = new RunCoordinator(lifecycle, normalizer, queue, {
      fetchRawResult: async () => {
        throw new Error("fetch failed");
      },
      pollIntervalMs: 0,
    });

    await queue.enqueue(makeJobPayload("raw-fail"));
    const stats = await coordinator.execute(RUN_ID);

    expect(stats.errors).toBeGreaterThan(0);
  });

  it("increments recordsNormalized but not recordsUnique when insert is conflict-skipped", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const rawStore = new Map<string, ProviderResult>([
      ["raw-1", makeProviderResult("Ace Plumbers")],
    ]);
    await queue.enqueue(makeJobPayload("raw-1"));
    const skippingStore: IRecordStore = {
      async insert(_r: BusinessRecord): Promise<void> {},
      async insertMany(_rs: readonly BusinessRecord[]): Promise<number> { return 0; },
      async getByRunId(_id: string): Promise<readonly BusinessRecord[]> { return []; },
      async countByRunId(_id: string): Promise<number> { return 0; },
    };
    const lifecycle = new RunLifecycleService(runStore, skippingStore);
    const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
    const coordinator = new RunCoordinator(lifecycle, normalizer, queue, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
      pollIntervalMs: 0,
    });
    const stats = await coordinator.execute(RUN_ID);
    expect(stats.recordsNormalized).toBe(1);
    expect(stats.rawResultsFound).toBe(1);
    expect(stats.recordsUnique).toBe(0);
    expect(stats.recordsDuplicate).toBe(1);
  });

  it("returns zero stats when queue is empty", async () => {
    runStore.seed(makeRun());
    const queue = new InMemoryQueue<NormalizationJobPayload>("norm");
    const coordinator = makeCoordinator(
      runStore,
      recordStore,
      queue,
      new Map(),
    );

    const stats = await coordinator.execute(RUN_ID);

    expect(stats.recordsNormalized).toBe(0);
    expect(stats.rawResultsFound).toBe(0);
    expect(stats.errors).toBe(0);
  });
});