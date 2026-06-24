/**
 * @module tests/unit/runtime/DiscoveryRunner
 *
 * Tests for DiscoveryRunner:
 *   - save count matches yielded results
 *   - enqueue count matches yielded results
 *   - returned DiscoveryStats are accurate
 *   - coordinator still works after discovery (full end-to-end path)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DiscoveryRunner } from "../../../src/runtime/DiscoveryRunner.js";
import { InMemoryRawResultStore } from "../../../src/storage/InMemoryRawResultStore.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { createServices } from "../../../src/runtime/createServices.js";
import type {
  IProvider,
  ProviderCapabilities,
  ProviderHealth,
  DiscoveryOptions,
} from "../../../src/core/interfaces/IProvider.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { ResolvedQuery } from "../../../src/core/models/Query.js";
import type {
  NormalizationJobPayload,
  Run,
} from "../../../src/core/models/Job.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import type { ScrapingPolicy } from "../../../src/core/types/rate-limit.js";
import type { ResumeToken } from "../../../src/core/types/pagination.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { AssembledStorage } from "../../../src/runtime/createStorage.js";
import type {
  RunServiceRunStore,
  RunServiceRecordStore,
} from "../../../src/storage/PostgresRunServiceAdapter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_RUN_ID = "run-discovery-test" as RunID;
const TEST_QUERY_ID = "q-discovery-1" as QueryID;

const STUB_RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 0,
};

function makeProviderResult(n: number, runId: RunID = TEST_RUN_ID): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: `result-${n}`,
    rawPayload: { name: `Business ${n}`, placeId: `place-${n}` },
    sourceUrl: `https://maps.example.com/place-${n}`,
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    runId,
    queryId: TEST_QUERY_ID,
    resumeToken: STUB_RESUME_TOKEN,
  };
}

function makeResolvedQuery(runId: RunID = TEST_RUN_ID): ResolvedQuery {
  return {
    id: TEST_QUERY_ID,
    runId,
    parentId: null,
    rawText: "plumbers Lagos",
    niche: "plumbers",
    providerId: "google-maps",
    generatedByStrategies: ["seed"],
    queryHash: "abc123" as import("../../../src/core/types/common.js").QueryHash,
    lifecycleState: "generated",
    status: "pending",
    createdAt: new Date(),
    geoTarget: { displayName: "Lagos", country: "Nigeria" },
    resolvedGeoTarget: {
      displayName: "Lagos",
      country: "Nigeria",
      coordinates: { lat: 6.5244, lng: 3.3792 },
      resolvedCoordinates: { lat: 6.5244, lng: 3.3792 },
    },
  };
}

function makeMockProvider(results: ProviderResult[]): IProvider {
  const capabilities: ProviderCapabilities = {
    supportsGeoFilter: false,
    supportsResultCount: false,
    supportsHours: false,
    supportsPriceLevel: false,
    supportsCoordinates: false,
    maxResultsPerQuery: null,
  };

  return {
    id: "mock-provider",
    displayName: "Mock Provider",
    capabilities,
    policy: {} as ScrapingPolicy,
    async checkHealth(): Promise<ProviderHealth> {
      return { status: "healthy" };
    },
    async *discover(
      _query: ResolvedQuery,
      _options?: DiscoveryOptions,
    ): AsyncGenerator<ProviderResult, void, undefined> {
      for (const r of results) yield r;
    },
    async shutdown(): Promise<void> {},
  };
}

// ---------------------------------------------------------------------------
// In-memory storage doubles
// ---------------------------------------------------------------------------

class InMemoryRunStore implements IRunStore {
  private readonly runs = new Map<string, Run>();
  async create(run: Run): Promise<void> { this.runs.set(run.id, run); }
  async getById(id: string): Promise<Run | null> { return this.runs.get(id) ?? null; }
  async list(): Promise<readonly Run[]> { return [...this.runs.values()]; }
  async listStaleRunning(olderThan: Date): Promise<readonly Run[]> {
    return [...this.runs.values()].filter(
      (r) => r.status === "running" && r.startedAt !== null && r.startedAt.getTime() < olderThan.getTime(),
    );
  }
  async listStalePending(_olderThan: Date): Promise<readonly Run[]> { return []; }
  async update(run: Run): Promise<void> { this.runs.set(run.id, run); }
  async delete(id: string): Promise<boolean> { return this.runs.delete(id); }
}

class InMemoryRecordStore implements IRecordStore {
  readonly inserted: BusinessRecord[] = [];
  async insert(record: BusinessRecord): Promise<void> { this.inserted.push(record); }
  async insertMany(records: readonly BusinessRecord[]): Promise<number> { this.inserted.push(...records); return records.length; }
  async getByRunId(runId: string): Promise<readonly BusinessRecord[]> {
    return this.inserted.filter((r) => r.runId === runId);
  }
  async countByRunId(runId: string): Promise<number> {
    return this.inserted.filter((r) => r.runId === runId).length;
  }
  async getByRunIdPaginated(runId: string, limit: number, offset: number): Promise<readonly BusinessRecord[]> {
    return this.inserted.filter((r) => r.runId === runId).slice(offset, offset + limit);
  }
}

class InMemoryRunServiceStore implements RunServiceRunStore {
  constructor(private readonly base: InMemoryRunStore) {}
  async create(run: Run): Promise<void> { return this.base.create(run); }
  async findById(id: string): Promise<Run | null> { return this.base.getById(id); }
  async list(): Promise<Run[]> { return [...(await this.base.list())] as Run[]; }
}

class InMemoryRecordServiceStore implements RunServiceRecordStore {
  constructor(private readonly base: InMemoryRecordStore) {}
  async findByRunId(runId: string): Promise<BusinessRecord[]> {
    return this.base.getByRunId(runId) as Promise<BusinessRecord[]>;
  }
  async list(req: { runId?: string }): Promise<{ items: BusinessRecord[]; total: number }> {
    const all = req.runId ? await this.base.getByRunId(req.runId) : [];
    return { items: all as BusinessRecord[], total: all.length };
  }
}

function makeStorage(
  runStore: InMemoryRunStore,
  recordStore: InMemoryRecordStore,
): AssembledStorage {
  return {
    client: {} as AssembledStorage["client"],
    rawResultStore: new InMemoryRawResultStore(),
    runStore,
    recordStore,
    runServiceStore: new InMemoryRunServiceStore(runStore),
    recordServiceStore: new InMemoryRecordServiceStore(recordStore),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiscoveryRunner", () => {
  let rawResultStore: InMemoryRawResultStore;
  let normalizationQueue: InMemoryQueue<NormalizationJobPayload>;

  beforeEach(() => {
    rawResultStore = new InMemoryRawResultStore();
    normalizationQueue = new InMemoryQueue<NormalizationJobPayload>("normalization");
  });

  it("saves each yielded result to rawResultStore", async () => {
    const provider = makeMockProvider([
      makeProviderResult(1),
      makeProviderResult(2),
      makeProviderResult(3),
    ]);
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

    await runner.run(makeResolvedQuery());

    expect(rawResultStore.size).toBe(3);
  });

  it("enqueues one normalization job per result", async () => {
    const provider = makeMockProvider([makeProviderResult(1), makeProviderResult(2)]);
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

    await runner.run(makeResolvedQuery());

    const depth = await normalizationQueue.depth();
    expect(depth.ok ? depth.value : -1).toBe(2);
  });

  it("returns accurate DiscoveryStats", async () => {
    const provider = makeMockProvider([
      makeProviderResult(1),
      makeProviderResult(2),
      makeProviderResult(3),
    ]);
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

    const stats = await runner.run(makeResolvedQuery());

    expect(stats.resultsCollected).toBe(3);
    expect(stats.resultsSaved).toBe(3);
    expect(stats.jobsEnqueued).toBe(3);
    expect(stats.errors).toBe(0);
  });

  it("returns zero stats when provider yields nothing", async () => {
    const provider = makeMockProvider([]);
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

    const stats = await runner.run(makeResolvedQuery());

    expect(stats.resultsCollected).toBe(0);
    expect(stats.resultsSaved).toBe(0);
    expect(stats.jobsEnqueued).toBe(0);
    expect(stats.errors).toBe(0);
    expect(rawResultStore.size).toBe(0);
  });

  it("enqueued jobs carry correct runId, queryId and providerId", async () => {
    const provider = makeMockProvider([makeProviderResult(1)]);
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

    await runner.run(makeResolvedQuery());

    const dequeued = await normalizationQueue.dequeue();
    expect(dequeued.ok).toBe(true);
    if (!dequeued.ok || !dequeued.value) return;

    expect(dequeued.value.payload.runId).toBe(TEST_RUN_ID);
    expect(dequeued.value.payload.queryId).toBe(TEST_QUERY_ID);
    expect(dequeued.value.payload.providerId).toBe("google-maps");
    expect(dequeued.value.payload.rawResultId).toBe("result-1");
  });

  it("does not hold a lifecycle reference � constructor takes only 3 args", () => {
    const provider = makeMockProvider([]);
    // If a 4th arg were required this would be a type error
    const runner = new DiscoveryRunner(provider, rawResultStore, normalizationQueue);
    expect(runner).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Full path: DiscoveryRunner -> coordinator.execute()
  // -------------------------------------------------------------------------

  it("coordinator normalizes records enqueued by DiscoveryRunner", async () => {
    const runStore = new InMemoryRunStore();
    const recordStore = new InMemoryRecordStore();
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage);

    // Create a run
    const createResult = await services.runService.createRun({
      niche: "plumbers",
      location: "Lagos",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const runId = createResult.data.id as RunID;

    // Build results belonging to this run
    const results = [makeProviderResult(1, runId), makeProviderResult(2, runId)];
    const provider = makeMockProvider(results);

    // Run discovery via the factory on services
    const discoveryRunner = services.createDiscoveryRunner(provider);
    const discoveryStats = await discoveryRunner.run(makeResolvedQuery(runId));
    expect(discoveryStats.jobsEnqueued).toBe(2);
    expect(discoveryStats.errors).toBe(0);

    // Coordinator drains queue, normalizes, persists
    const runStats = await services.coordinator.execute(runId);

        expect(runStats.recordsNormalized).toBe(2);
    expect(runStats.rawResultsFound).toBe(2);
    expect(runStats.recordsUnique).toBe(2);
    expect(runStats.errors).toBe(0);

    const persisted = await recordStore.getByRunId(runId);
    expect(persisted).toHaveLength(2);
    expect(persisted.map((r) => r.name).sort()).toEqual(["Business 1", "Business 2"]);

    const finalRun = await runStore.getById(runId);
    expect(finalRun?.status).toBe("complete");
  });
});
