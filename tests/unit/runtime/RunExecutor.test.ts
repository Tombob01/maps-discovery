/**
 * @module tests/unit/runtime/RunExecutor
 *
 * Integration test for the full runtime execution path:
 *
 *   createServices() -> runService.createRun()
 *                    -> rawResultStore.save()
 *                    -> normalizationQueue.enqueue()
 *                    -> coordinator.execute(runId)
 *                    -> records persisted, run completed
 *
 * All Postgres dependencies are replaced with in-memory doubles.
 * No network, no DB, no filesystem.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createServices } from "../../../src/runtime/createServices.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import type { NormalizationJobPayload } from "../../../src/core/models/Job.js";
import type { Run } from "../../../src/core/models/Job.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type { AssembledStorage } from "../../../src/runtime/createStorage.js";
import type { RunServiceRunStore, RunServiceRecordStore } from "../../../src/storage/PostgresRunServiceAdapter.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID } from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// In-memory store doubles
// ---------------------------------------------------------------------------

class InMemoryRunStore implements IRunStore {
  private readonly runs = new Map<string, Run>();

  async create(run: Run): Promise<void> {
    this.runs.set(run.id, run);
  }
  async getById(id: string): Promise<Run | null> {
    return this.runs.get(id) ?? null;
  }
  async list(): Promise<readonly Run[]> {
    return [...this.runs.values()];
  }
  async update(run: Run): Promise<void> {
    this.runs.set(run.id, run);
  }
  async delete(id: string): Promise<boolean> {
    return this.runs.delete(id);
  }
}

class InMemoryRecordStore implements IRecordStore {
  readonly inserted: BusinessRecord[] = [];

  async insert(record: BusinessRecord): Promise<void> {
    this.inserted.push(record);
  }
  async insertMany(records: readonly BusinessRecord[]): Promise<void> {
    this.inserted.push(...records);
  }
  async getByRunId(runId: string): Promise<readonly BusinessRecord[]> {
    return this.inserted.filter((r) => r.runId === runId);
  }
  async countByRunId(runId: string): Promise<number> {
    return this.inserted.filter((r) => r.runId === runId).length;
  }
}

// Minimal RunServiceRunStore double (satisfies RunService constructor)
class InMemoryRunServiceStore implements RunServiceRunStore {
  constructor(private readonly base: InMemoryRunStore) {}
  async create(run: Run): Promise<void> { return this.base.create(run); }
  async findById(id: string): Promise<Run | null> { return this.base.getById(id); }
  async list(): Promise<Run[]> {
    const runs = await this.base.list();
    return runs as Run[];
  }
}

// Minimal RunServiceRecordStore double
class InMemoryRecordServiceStore implements RunServiceRecordStore {
  constructor(private readonly base: InMemoryRecordStore) {}
  async findByRunId(runId: string): Promise<BusinessRecord[]> {
    return this.base.getByRunId(runId) as Promise<BusinessRecord[]>;
  }
  async list(req: { runId?: string; page?: number; pageSize?: number }): Promise<{ items: BusinessRecord[]; total: number }> {
    const all = req.runId ? await this.base.getByRunId(req.runId) : [];
    return { items: all as BusinessRecord[], total: all.length };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(
  runStore: InMemoryRunStore,
  recordStore: InMemoryRecordStore,
): AssembledStorage {
  // PostgresClient is unused in tests — cast unknown satisfies the type
  const client = {} as AssembledStorage["client"];
  return {
    client,
    runStore,
    recordStore,
    runServiceStore: new InMemoryRunServiceStore(runStore),
    recordServiceStore: new InMemoryRecordServiceStore(recordStore),
  };
}

function makeProviderResult(overrides: Partial<ProviderResult> = {}): ProviderResult {
  return {
    providerResultId: `pr-${Math.random().toString(36).slice(2, 8)}`, 
    providerId: "google-maps",
    runId: "run-test" as RunID,
    queryId: "q-1" as import("../../../src/core/types/common.js").QueryID,
    rawPayload: {
      placeId: "ChIJ_test",
      name: "Test Business",
      address: "123 Main St, Lagos, NG",
      phone: "+2341234567890",
      website: null,
      categories: ["Restaurant"],
      rating: 4.2,
      reviewCount: 150,
      hours: null,
      priceLevel: null,
      location: { lat: 6.5244, lng: 3.3792 },
    },
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    sourceUrl: "https://maps.google.com/test",
    resumeToken: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runtime execution path — createServices() + coordinator.execute()", () => {
  let runStore: InMemoryRunStore;
  let recordStore: InMemoryRecordStore;
  let queue: InMemoryQueue<NormalizationJobPayload>;

  beforeEach(() => {
    runStore = new InMemoryRunStore();
    recordStore = new InMemoryRecordStore();
    queue = new InMemoryQueue<NormalizationJobPayload>("normalization");
  });

  it("creates services without throwing", () => {
    const storage = makeStorage(runStore, recordStore);
    expect(() => createServices(storage, { normalizationQueue: queue })).not.toThrow();
  });

  it("exposes coordinator, rawResultStore, normalizationQueue on AssembledServices", () => {
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage, { normalizationQueue: queue });

    expect(services.coordinator).toBeDefined();
    expect(services.rawResultStore).toBeDefined();
    expect(services.normalizationQueue).toBeDefined();
    expect(services.lifecycle).toBeDefined();
    expect(services.runService).toBeDefined();
  });

  it("full path: createRun -> enqueue -> execute -> run is complete", async () => {
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage, { normalizationQueue: queue });

    // 1. Create run (status=pending, persisted)
    const createResult = await services.runService.createRun({
      niche: "plumbers",
      location: "Lagos",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const runId = createResult.data.id as RunID;

    // 2. Save a raw result into the bridge store
    const rawResult = makeProviderResult({ runId });
    services.rawResultStore.save(rawResult);

    // 3. Enqueue a normalization job
    await services.normalizationQueue.enqueue({
      runId,
      queryId: "q-1" as import("../../../src/core/types/common.js").QueryID,
      rawResultId: rawResult.providerResultId as import("../../../src/core/types/common.js").UUID,
      providerId: "google-maps",
    });

    // 4. Execute — drains queue, persists records, completes run
    const stats = await services.coordinator.execute(runId);

    // 5. Run should be complete
    const finalRun = await runStore.getById(runId);
    expect(finalRun).not.toBeNull();
    expect(finalRun?.status).toBe("complete");

    // 6. Stats should reflect at least one normalized record
    expect(stats.recordsNormalized).toBeGreaterThanOrEqual(1);
    expect(stats.rawResultsFound).toBeGreaterThanOrEqual(1);
  });

  it("execute with empty queue completes immediately with zero stats delta", async () => {
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage, { normalizationQueue: queue });

    const createResult = await services.runService.createRun({
      niche: "electricians",
      location: "Abuja",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const runId = createResult.data.id as RunID;

    // No jobs enqueued — drain immediately stops
    const stats = await services.coordinator.execute(runId);

    const finalRun = await runStore.getById(runId);
    expect(finalRun?.status).toBe("complete");
    expect(stats.recordsNormalized).toBe(0);
    expect(stats.errors).toBe(0);
  });

  it("execute with missing raw result skips gracefully (no throw)", async () => {
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage, { normalizationQueue: queue });

    const createResult = await services.runService.createRun({
      niche: "painters",
      location: "Port Harcourt",
    });
    if (!createResult.ok) return;
    const runId = createResult.data.id as RunID;

    // Enqueue a job pointing at a non-existent raw result
    await services.normalizationQueue.enqueue({
      runId,
      queryId: "q-missing" as import("../../../src/core/types/common.js").QueryID,
      rawResultId: "does-not-exist" as import("../../../src/core/types/common.js").UUID,
      providerId: "google-maps",
    });

    // Should not throw — NormalizationStage skips missing raw results
    const stats = await services.coordinator.execute(runId);

    const finalRun = await runStore.getById(runId);
    expect(finalRun?.status).toBe("complete");
    expect(stats.recordsNormalized).toBe(0);
  });

  it("rawResultStore.clearRun() frees memory after execution", async () => {
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage, { normalizationQueue: queue });

    const rawResult = makeProviderResult({
      runId: "run-cleanup" as RunID,
    });
    services.rawResultStore.save(rawResult);
    expect(services.rawResultStore.size).toBe(1);

    services.rawResultStore.clearRun("run-cleanup" as RunID);
    expect(services.rawResultStore.size).toBe(0);
  });
});

