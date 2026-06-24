import { InMemoryRawResultStore } from "../../../src/storage/InMemoryRawResultStore.js";
/**
 * @module tests/unit/runtime/RuntimeExecutor
 *
 * Tests for RuntimeExecutor:
 *   - success path: both stats returned
 *   - zero discovery path: coordinator still invoked
 *   - coordinator exception propagates unchanged
 *   - summary aggregation: discovery + normalization counts correct
 *   - sequential executions remain isolated
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RuntimeExecutor } from "../../../src/runtime/RuntimeExecutor.js";
import { createServices } from "../../../src/runtime/createServices.js";
import type { DiscoveryRunner, DiscoveryStats } from "../../../src/runtime/DiscoveryRunner.js";
import type { RunCoordinator } from "../../../src/pipeline/RunCoordinator.js";
import type { RunStats } from "../../../src/core/models/Job.js";
import type {
  IProvider,
  ProviderCapabilities,
  ProviderHealth,
  DiscoveryOptions,
} from "../../../src/core/interfaces/IProvider.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { ResolvedQuery } from "../../../src/core/models/Query.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import type { ScrapingPolicy } from "../../../src/core/types/rate-limit.js";
import type { ResumeToken } from "../../../src/core/types/pagination.js";
import type { Run } from "../../../src/core/models/Job.js";
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

const TEST_RUN_ID = "run-executor-test" as RunID;
const TEST_QUERY_ID = "q-executor-1" as QueryID;

const STUB_RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 0,
};

const ZERO_RUN_STATS: RunStats = {
  queriesGenerated: 0,
  queriesDispatched: 0,
  rawResultsFound: 0,
  recordsNormalized: 0,
  recordsUnique: 0,
  recordsDuplicate: 0,
  recordsExported: 0,
  errors: 0,
};

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

function makeDiscoveryStats(n: number): DiscoveryStats {
  return {
    resultsCollected: n,
    resultsSaved: n,
    jobsEnqueued: n,
    errors: 0,
  };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockDiscoveryRunner(stats: DiscoveryStats): DiscoveryRunner {
  return {
    run: vi.fn().mockResolvedValue(stats),
  } as unknown as DiscoveryRunner;
}

function makeMockCoordinator(result: RunStats | Error): RunCoordinator {
  const execute =
    result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);
  return { execute } as unknown as RunCoordinator;
}

function makeRuntimeExecutor(
  discoveryStats: DiscoveryStats,
  coordinatorResult: RunStats | Error,
): RuntimeExecutor {
  const mockRunner = makeMockDiscoveryRunner(discoveryStats);
  const mockCoordinator = makeMockCoordinator(coordinatorResult);
  const factory = vi.fn().mockReturnValue(mockRunner);
  return new RuntimeExecutor(factory, mockCoordinator);
}

// ---------------------------------------------------------------------------
// In-memory storage doubles (for integration test)
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
  async insert(r: BusinessRecord): Promise<void> { this.inserted.push(r); }
  async insertMany(rs: readonly BusinessRecord[]): Promise<number> { this.inserted.push(...rs); return rs.length; }
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
    runStore,
    recordStore,
    rawResultStore: new InMemoryRawResultStore(),
    runServiceStore: new InMemoryRunServiceStore(runStore),
    recordServiceStore: new InMemoryRecordServiceStore(recordStore),
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
    id: "google-maps",
    displayName: "Mock Google Maps",
    capabilities,
    policy: {} as ScrapingPolicy,
    async checkHealth(): Promise<ProviderHealth> { return { status: "healthy" }; },
    async *discover(_q: ResolvedQuery, _o?: DiscoveryOptions): AsyncGenerator<ProviderResult> {
      for (const r of results) yield r;
    },
    async shutdown(): Promise<void> {},
  };
}

function makeProviderResult(n: number, runId: RunID): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: `result-${n}`,
    rawPayload: { name: `Business ${n}`, placeId: `place-${n}` },
    sourceUrl: null,
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    runId,
    queryId: TEST_QUERY_ID,
    resumeToken: STUB_RESUME_TOKEN,
  };
}

// ---------------------------------------------------------------------------
// Unit tests (mocked coordinator + discovery runner)
// ---------------------------------------------------------------------------

describe("RuntimeExecutor (unit)", () => {
  it("success path: returns both discovery and normalization stats", async () => {
    const dStats = makeDiscoveryStats(3);
    const nStats = { ...ZERO_RUN_STATS, recordsNormalized: 3, rawResultsFound: 3 };
    const executor = makeRuntimeExecutor(dStats, nStats);

    const summary = await executor.execute({
      provider: makeMockProvider([]),
      runId: TEST_RUN_ID,
      query: makeResolvedQuery(),
    });

    expect(summary.discovery).toEqual(dStats);
    expect(summary.normalization).toEqual(nStats);
  });

  it("zero discovery path: coordinator is still invoked", async () => {
    const dStats = makeDiscoveryStats(0);
    const nStats = { ...ZERO_RUN_STATS };
    const mockRunner = makeMockDiscoveryRunner(dStats);
    const mockCoordinator = makeMockCoordinator(nStats);
    const factory = vi.fn().mockReturnValue(mockRunner);
    const executor = new RuntimeExecutor(factory, mockCoordinator);

    await executor.execute({
      provider: makeMockProvider([]),
      runId: TEST_RUN_ID,
      query: makeResolvedQuery(),
    });

    expect(mockCoordinator.execute).toHaveBeenCalledOnce();
    expect(mockCoordinator.execute).toHaveBeenCalledWith(TEST_RUN_ID);
  });

  it("coordinator exception propagates unchanged", async () => {
    const boom = new Error("coordinator exploded");
    const executor = makeRuntimeExecutor(makeDiscoveryStats(1), boom);

    await expect(
      executor.execute({
        provider: makeMockProvider([]),
        runId: TEST_RUN_ID,
        query: makeResolvedQuery(),
      }),
    ).rejects.toThrow("coordinator exploded");
  });

  it("summary aggregation: discovery jobsEnqueued matches normalization rawResultsFound", async () => {
    const n = 5;
    const dStats = makeDiscoveryStats(n);
    const nStats = { ...ZERO_RUN_STATS, rawResultsFound: n, recordsNormalized: n };
    const executor = makeRuntimeExecutor(dStats, nStats);

    const summary = await executor.execute({
      provider: makeMockProvider([]),
      runId: TEST_RUN_ID,
      query: makeResolvedQuery(),
    });

    expect(summary.discovery.jobsEnqueued).toBe(summary.normalization.rawResultsFound);
    expect(summary.discovery.jobsEnqueued).toBe(summary.normalization.recordsNormalized);
  });

  it("sequential executions use isolated coordinator calls", async () => {
    const dStats = makeDiscoveryStats(1);
    const nStats = { ...ZERO_RUN_STATS, recordsNormalized: 1 };
    const mockRunner = makeMockDiscoveryRunner(dStats);
    const mockCoordinator = makeMockCoordinator(nStats);
    const factory = vi.fn().mockReturnValue(mockRunner);
    const executor = new RuntimeExecutor(factory, mockCoordinator);

    const runIdA = "run-a" as RunID;
    const runIdB = "run-b" as RunID;

    await executor.execute({ provider: makeMockProvider([]), runId: runIdA, query: makeResolvedQuery(runIdA) });
    await executor.execute({ provider: makeMockProvider([]), runId: runIdB, query: makeResolvedQuery(runIdB) });

    expect(mockCoordinator.execute).toHaveBeenCalledTimes(2);
    expect(mockCoordinator.execute).toHaveBeenNthCalledWith(1, runIdA);
    expect(mockCoordinator.execute).toHaveBeenNthCalledWith(2, runIdB);
  });
});

// ---------------------------------------------------------------------------
// Integration test (real services, mock provider)
// ---------------------------------------------------------------------------

describe("RuntimeExecutor (integration via createServices)", () => {
  it("runtimeExecutor.execute() runs full path and returns summary", async () => {
    const runStore = new InMemoryRunStore();
    const recordStore = new InMemoryRecordStore();
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage);

    // Create run
    const createResult = await services.runService.createRun({
      niche: "plumbers",
      location: "Lagos",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const runId = createResult.data.id as RunID;

    // Build provider with real payloads
    const results = [makeProviderResult(1, runId), makeProviderResult(2, runId)];
    const provider = makeMockProvider(results);

    // Execute via runtimeExecutor
    const summary = await services.runtimeExecutor.execute({
      provider,
      runId,
      query: makeResolvedQuery(runId),
    });

    expect(summary.discovery.resultsCollected).toBe(2);
    expect(summary.discovery.jobsEnqueued).toBe(2);
    expect(summary.normalization.recordsNormalized).toBeGreaterThanOrEqual(1);

    const finalRun = await runStore.getById(runId);
    expect(finalRun?.status).toBe("complete");
  });
});