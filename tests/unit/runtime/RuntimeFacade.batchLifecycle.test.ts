/**
 * @module tests/unit/runtime/RuntimeFacade.batchLifecycle
 *
 * Slice E — batch-level regression test for the multi-seed run-status
 * lifecycle bug (proven live and fixed in Slices A-D).
 *
 * Exercises the REAL RuntimeFacade -> RuntimeExecutor -> RunCoordinator ->
 * RunLifecycleService path (via real createServices()), not mocked layers,
 * against a real in-memory Run store, so that Run.status is observed
 * exactly as it would be persisted in production between sequential
 * executeFromSeed() calls.
 *
 * Covers:
 *   1. A fully successful two-seed batch: status stays "running" (not
 *      "complete") after the first, non-final seed, and only becomes
 *      "complete" after the final seed.
 *   2. Option II failure interleaving: a later, final seed's own
 *      successful work must NOT overwrite an earlier seed's failure --
 *      final status must be "failed", never "complete".
 */

import { describe, it, expect } from "vitest";
import { createServices } from "../../../src/runtime/createServices.js";
import { InMemoryRawResultStore } from "../../../src/storage/InMemoryRawResultStore.js";
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

const TEST_QUERY_ID = "q-batch-lifecycle-1" as QueryID;

const STUB_RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 0,
};

// Reuses the exact same real-provider pattern already established in
// RuntimeFacade.test.ts and RuntimeExecutor.test.ts's integration blocks.
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
    providerResultId: `batch-lifecycle-result-${n}`,
    rawPayload: { name: `Business ${n}`, placeId: `place-batch-${n}` },
    sourceUrl: null,
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    runId,
    queryId: TEST_QUERY_ID,
    resumeToken: STUB_RESUME_TOKEN,
  };
}

// ---------------------------------------------------------------------------
// In-memory storage doubles -- identical pattern to the one already
// established and proven in RuntimeFacade.test.ts / RuntimeExecutor.test.ts.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RuntimeFacade — multi-seed batch lifecycle (Slice E)", () => {
  it("a two-seed successful batch stays running after the first seed and only becomes complete after the final seed", async () => {
    const runStore = new InMemoryRunStore();
    const recordStore = new InMemoryRecordStore();
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage);
    const facade = services.runtimeFacade;

    const { runId } = await facade.createRun({ niche: "plumbers", location: "Nigeria" });
    const typedRunId = runId as RunID;

    await facade.startRun(typedRunId);

    // Seed 0 -- not the final seed in the batch.
    const seed0Provider = makeRealProvider([makeProviderResult(1, typedRunId)]);
    await facade.executeFromSeed({
      provider: seed0Provider,
      runId: typedRunId,
      keyword: "plumbers",
      location: "Nigeria",
      isLastSeed: false,
      batchFailed: false,
    });

    // The run must NOT be terminal yet -- this is exactly the bug proven
    // live earlier: status must remain "running" between seeds.
    const midRun = await runStore.getById(typedRunId);
    expect(midRun?.status).toBe("running");
    expect(midRun?.completedAt).toBeNull();

    // Seed 1 -- the final seed in the batch.
    const seed1Provider = makeRealProvider([makeProviderResult(2, typedRunId)]);
    await facade.executeFromSeed({
      provider: seed1Provider,
      runId: typedRunId,
      keyword: "plumbers",
      location: "Nigeria",
      isLastSeed: true,
      batchFailed: false,
    });

    const finalRun = await runStore.getById(typedRunId);
    expect(finalRun?.status).toBe("complete");
    expect(finalRun?.completedAt).not.toBeNull();
  });

  it("a later successful final seed does not overwrite an earlier seed's failure (Option II)", async () => {
    const runStore = new InMemoryRunStore();
    const recordStore = new InMemoryRecordStore();
    const storage = makeStorage(runStore, recordStore);
    const services = createServices(storage);
    const facade = services.runtimeFacade;

    const { runId } = await facade.createRun({ niche: "plumbers", location: "Nigeria" });
    const typedRunId = runId as RunID;

    await facade.startRun(typedRunId);

    // Seed 0 -- succeeds, not the final seed.
    const seed0Provider = makeRealProvider([makeProviderResult(1, typedRunId)]);
    await facade.executeFromSeed({
      provider: seed0Provider,
      runId: typedRunId,
      keyword: "plumbers",
      location: "Nigeria",
      isLastSeed: false,
      batchFailed: false,
    });

    // Seed 1 -- the final seed. Its own work succeeds (a real provider
    // yielding a result), but batchFailed: true reflects that an earlier
    // seed in the batch already failed (as server.ts's batchFailed flag
    // would carry forward). Per Option II, the final transition must be
    // "failed", never "complete".
    const seed1Provider = makeRealProvider([makeProviderResult(2, typedRunId)]);
    await facade.executeFromSeed({
      provider: seed1Provider,
      runId: typedRunId,
      keyword: "plumbers",
      location: "Nigeria",
      isLastSeed: true,
      batchFailed: true,
    });

    const finalRun = await runStore.getById(typedRunId);
    expect(finalRun?.status).toBe("failed");
    expect(finalRun?.completedAt).not.toBeNull();
    expect(finalRun?.status).not.toBe("complete");
  });
});