/**
 * @module tests/unit/runtime/RuntimeFacade
 *
 * Tests for RuntimeFacade:
 *   - delegates createRun correctly
 *   - delegates executeRun correctly
 *   - delegates getRun (found + not found)
 *   - delegates listRecords
 *   - propagates executeRun errors
 *   - facade holds no state between calls
 *   - integration test via real createServices
 */

import { describe, it, expect, vi } from "vitest";
import { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";
import { createServices } from "../../../src/runtime/createServices.js";
import { InMemoryRawResultStore } from "../../../src/storage/InMemoryRawResultStore.js";
import type { RunService } from "../../../src/api/RunService.js";
import type { RuntimeExecutor, ExecutionSummary } from "../../../src/runtime/RuntimeExecutor.js";
import type { DiscoveryStats } from "../../../src/runtime/DiscoveryRunner.js";
import type {
  IProvider,
  ProviderCapabilities,
  ProviderHealth,
  DiscoveryOptions,
} from "../../../src/core/interfaces/IProvider.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { ResolvedQuery } from "../../../src/core/models/Query.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import type { RunStats, Run } from "../../../src/core/models/Job.js";
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

const TEST_RUN_ID = "run-facade-test" as RunID;
const TEST_QUERY_ID = "q-facade-1" as QueryID;

const STUB_RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 0,
};

const ZERO_DISCOVERY: DiscoveryStats = {
  resultsCollected: 0, resultsSaved: 0, jobsEnqueued: 0, errors: 0,
};

const ZERO_RUN_STATS: RunStats = {
  queriesGenerated: 0, queriesDispatched: 0, rawResultsFound: 0,
  recordsNormalized: 0, recordsUnique: 0, recordsDuplicate: 0,
  recordsExported: 0, errors: 0,
};

const STUB_SUMMARY: ExecutionSummary = {
  discovery: ZERO_DISCOVERY,
  normalization: ZERO_RUN_STATS,
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
    },
  };
}

function makeMockProvider(): IProvider {
  return {
    id: "google-maps",
    displayName: "Mock",
    capabilities: {} as ProviderCapabilities,
    policy: {} as ScrapingPolicy,
    async checkHealth(): Promise<ProviderHealth> { return { status: "healthy" }; },
    async *discover(_q: ResolvedQuery, _o?: DiscoveryOptions): AsyncGenerator<ProviderResult> {},
    async shutdown() {},
  };
}

// ---------------------------------------------------------------------------
// Mock service builders
// ---------------------------------------------------------------------------

function makeMockRunService(overrides: Partial<RunService> = {}): RunService {
  return {
    createRun: vi.fn().mockResolvedValue({ ok: true, data: { id: TEST_RUN_ID, status: "pending", niche: "plumbers", location: "Lagos", startedAt: new Date().toISOString(), completedAt: null, stats: ZERO_RUN_STATS } }),
    getRun: vi.fn().mockResolvedValue({ ok: true, data: { id: TEST_RUN_ID, status: "complete", niche: "plumbers", location: "Lagos", startedAt: new Date().toISOString(), completedAt: null, stats: ZERO_RUN_STATS } }),
    listRuns: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listRecords: vi.fn().mockResolvedValue({ ok: true, data: { items: [], total: 0, page: 1, pageSize: 20, hasMore: false } }),
    exportRun: vi.fn().mockResolvedValue({ ok: true, data: { recordsExported: 0, format: "jsonl", destination: "" } }),
    ...overrides,
  } as unknown as RunService;
}

function makeMockExecutor(result: ExecutionSummary | Error = STUB_SUMMARY): RuntimeExecutor {
  return {
    execute: result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result),
  } as unknown as RuntimeExecutor;
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("RuntimeFacade (unit)", () => {
  it("createRun delegates to runService and returns runId + status", async () => {
    const runService = makeMockRunService();
    const facade = new RuntimeFacade(runService, makeMockExecutor());

    const result = await facade.createRun({ niche: "plumbers", location: "Lagos" });

    expect(runService.createRun).toHaveBeenCalledWith({ niche: "plumbers", location: "Lagos" });
    expect(result.runId).toBe(TEST_RUN_ID);
    expect(result.status).toBe("pending");
  });

  it("createRun throws when runService returns error", async () => {
    const runService = makeMockRunService({
      createRun: vi.fn().mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "niche is required" } }),
    });
    const facade = new RuntimeFacade(runService, makeMockExecutor());

    await expect(facade.createRun({ niche: "", location: "Lagos" })).rejects.toThrow("niche is required");
  });

  it("executeRun delegates to runtimeExecutor and returns summary unchanged", async () => {
    const executor = makeMockExecutor(STUB_SUMMARY);
    const facade = new RuntimeFacade(makeMockRunService(), executor);
    const opts = { provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() };

    const summary = await facade.executeRun(opts);

    expect(executor.execute).toHaveBeenCalledWith(opts);
    expect(summary).toEqual(STUB_SUMMARY);
  });

  it("executeRun propagates executor errors", async () => {
    const facade = new RuntimeFacade(makeMockRunService(), makeMockExecutor(new Error("exec failed")));

    await expect(
      facade.executeRun({ provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() }),
    ).rejects.toThrow("exec failed");
  });

  it("getRun returns RunView when found", async () => {
    const facade = new RuntimeFacade(makeMockRunService(), makeMockExecutor());
    const run = await facade.getRun(TEST_RUN_ID);
    expect(run).not.toBeNull();
    expect(run?.id).toBe(TEST_RUN_ID);
    expect(run?.status).toBe("complete");
  });

  it("getRun returns null when not found", async () => {
    const runService = makeMockRunService({
      getRun: vi.fn().mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "not found" } }),
    });
    const facade = new RuntimeFacade(runService, makeMockExecutor());
    const run = await facade.getRun("nonexistent");
    expect(run).toBeNull();
  });

  it("listRecords delegates and returns RecordPage", async () => {
    const facade = new RuntimeFacade(makeMockRunService(), makeMockExecutor());
    const page = await facade.listRecords(TEST_RUN_ID, 1, 20);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.page).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  it("facade holds no state between calls", async () => {
    const runService = makeMockRunService();
    const facade = new RuntimeFacade(runService, makeMockExecutor());

    await facade.createRun({ niche: "plumbers", location: "Lagos" });
    await facade.createRun({ niche: "electricians", location: "Abuja" });

    expect(runService.createRun).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Integration test
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

function makeStorage(runStore: InMemoryRunStore, recordStore: InMemoryRecordStore): AssembledStorage {
  return {
    client: {} as AssembledStorage["client"],
    runStore,
    recordStore,
    runServiceStore: new InMemoryRunServiceStore(runStore),
    rawResultStore: new InMemoryRawResultStore(),
    recordServiceStore: new InMemoryRecordServiceStore(recordStore),
  };
}

function makeRealProvider(results: ProviderResult[]): IProvider {
  return {
    id: "google-maps",
    displayName: "Mock Google Maps",
    capabilities: {} as ProviderCapabilities,
    policy: {} as ScrapingPolicy,
    async checkHealth(): Promise<ProviderHealth> { return { status: "healthy" }; },
    async *discover(_q: ResolvedQuery, _o?: DiscoveryOptions): AsyncGenerator<ProviderResult> {
      for (const r of results) yield r;
    },
    async shutdown() {},
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

describe("RuntimeFacade (integration)", () => {
  it("createRun -> executeRun -> getRun -> listRecords full path", async () => {
    const runStore = new InMemoryRunStore();
    const recordStore = new InMemoryRecordStore();
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage);
    const facade = services.runtimeFacade;

    // 1. Create run
    const { runId, status } = await facade.createRun({ niche: "plumbers", location: "Lagos" });
    expect(status).toBe("pending");

    // 2. Execute run
    const results = [
      makeProviderResult(1, runId as RunID),
      makeProviderResult(2, runId as RunID),
    ];
    const provider = makeRealProvider(results);
    const summary = await facade.executeRun({
      provider,
      runId: runId as RunID,
      query: makeResolvedQuery(runId as RunID),
    });

    expect(summary.discovery.resultsCollected).toBe(2);
    expect(summary.normalization.recordsNormalized).toBeGreaterThanOrEqual(1);

    // 3. getRun reflects completed status
    const run = await facade.getRun(runId);
    expect(run).not.toBeNull();
    expect(run?.status).toBe("complete");

    // 4. listRecords returns normalized records
    const page = await facade.listRecords(runId);
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.items.length).toBeGreaterThanOrEqual(1);
  });
});