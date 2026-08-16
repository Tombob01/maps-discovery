/**
 * tests/unit/pipeline/proposalProductionIntegration.test.ts
 *
 * Focused integration test proving the REAL proposal-production
 * execution chain, driven through RunCoordinator.execute():
 *
 *   queued ProposalProductionJobPayload
 *     -> ProposalProductionCoordinator.drain()
 *     -> PipelineRunner
 *     -> ProposalProductionStage.execute()
 *     -> ProposalOrchestrator.produceProposal()
 *     -> ProposalBuilder.build()
 *     -> IProposalStore.save()
 *     -> persisted IdentityProposal captured by the test store.
 *
 * Real (production) classes exercised: InMemoryQueue,
 * ProposalProductionCoordinator, ProposalProductionStage,
 * ProposalOrchestrator, ProposalBuilder, RunCoordinator,
 * RunLifecycleService, BusinessNormalizer.
 *
 * Stubbed: IRawResultStore, IProposalStore -- hand-written
 * interface implementations, consistent with this codebase's
 * established convention (see ProposalOrchestrator.test.ts,
 * RunCoordinator.test.ts) rather than mocking concrete classes.
 *
 * Deliberately does NOT exercise: DiscoveryRunner's enqueue
 * behavior, PostgresProposalRepository, createServices() wiring,
 * BullMQ, confirmation, or publication/materialization -- all
 * separate concerns, out of scope for this test.
 */

import { describe, it, expect } from "vitest";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { ProposalProductionCoordinator } from "../../../src/pipeline/ProposalProductionCoordinator.js";
import { ProposalProductionStage } from "../../../src/pipeline/ProposalProductionStage.js";
import { ProposalOrchestrator } from "../../../src/proposal/ProposalOrchestrator.js";
import { ProposalBuilder } from "../../../src/normalizer/ProposalBuilder.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import { RunCoordinator } from "../../../src/pipeline/RunCoordinator.js";
import { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { IRecordStore } from "../../../src/storage/IRecordStore.js";
import type { IRawResultStore } from "../../../src/storage/IRawResultStore.js";
import type { IProposalStore, PersistedProposal } from "../../../src/storage/IProposalStore.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type {
  Run,
  NormalizationJobPayload,
  ProposalProductionJobPayload,
} from "../../../src/core/models/Job.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Stubs (hand-written, matching this codebase's established convention --
// see ProposalOrchestrator.test.ts / RunCoordinator.test.ts)
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
  async listStalePending(_olderThan: Date): Promise<readonly Run[]> {
    return [];
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
  async getByRunId(_id: string): Promise<readonly BusinessRecord[]> {
    return this.inserted;
  }
  async getByRunIdPaginated(
    _id: string,
    limit: number,
    offset: number,
  ): Promise<readonly BusinessRecord[]> {
    return this.inserted.slice(offset, offset + limit);
  }
  async countByRunId(_id: string): Promise<number> {
    return this.inserted.length;
  }
}

/** Stub IRawResultStore -- fetchById is the only method this chain calls. */
class StubRawResultStore implements IRawResultStore {
  constructor(private readonly byUuid: Map<string, ProviderResult>) {}
  async save(_result: ProviderResult): Promise<boolean> {
    throw new Error("StubRawResultStore.save() not used by this test");
  }
  async fetch(_id: string): Promise<ProviderResult | null> {
    throw new Error("StubRawResultStore.fetch() not used by this test");
  }
  async fetchById(id: UUID): Promise<ProviderResult | null> {
    return this.byUuid.get(id) ?? null;
  }
  async saveAndGetId(_result: ProviderResult): Promise<{ id: UUID; isNew: boolean }> {
    throw new Error("StubRawResultStore.saveAndGetId() not used by this test");
  }
}

/** Stub IProposalStore -- records every save() call for assertion. */
class StubProposalStore implements IProposalStore {
  readonly saved: IdentityProposal[] = [];
  async save(proposal: IdentityProposal): Promise<PersistedProposal> {
    this.saved.push(proposal);
    return {
      id: `persisted-${this.saved.length}` as UUID,
      proposal,
      createdAt: new Date("2024-06-01T00:00:00Z"),
    };
  }
  async fetchById(_id: UUID): Promise<PersistedProposal | null> {
    throw new Error("StubProposalStore.fetchById() not used by this test");
  }
  async listByCandidateFingerprint(): Promise<readonly PersistedProposal[]> {
    throw new Error("StubProposalStore.listByCandidateFingerprint() not used by this test");
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = "run-proposal-integration-001" as RunID;
const QUERY_ID = "q-1" as QueryID;
const RAW_RESULT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as UUID;

function makeRun(): Run {
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
  };
}

/** Realistic google-maps raw payload -- same shape as ProposalOrchestrator.test.ts's fixture. */
function makeSeededRawResult(): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: "ChIJ123",
    rawPayload: {
      name: "Ace Plumbers Ltd",
      phone: "+234 801 234 5678",
      website: "https://aceplumbers.ng",
      address: "1 Marina, Lagos Island, Lagos, Nigeria",
      placeId: "ChIJ123",
      listingUrl: "https://maps.google.com/place/123",
      ratingText: "4.5 stars",
      reviewCountText: "123 reviews",
      categoryText: "Plumbing, Home Services",
      coordinates: { lat: 6.5244, lng: 3.3792 },
      hoursRaw: ["Mon-Fri: 09:00-17:00", "Saturday: 10:00-14:00"],
    },
    sourceUrl: "https://maps.google.com/place/123",
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: RUN_ID,
    queryId: QUERY_ID,
    resumeToken: {
      strategy: "offset",
      pageRequest: { kind: "offset", page: 1, pageSize: 20 },
      createdAt: Date.now(),
    },
  };
}

function makeProposalJobPayload(): ProposalProductionJobPayload {
  return {
    runId: RUN_ID,
    queryId: QUERY_ID,
    rawResultId: RAW_RESULT_ID,
    providerId: "google-maps",
  };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("Proposal-production integration (real chain via RunCoordinator)", () => {
  it("drains a queued job through the real chain and persists a correct IdentityProposal", async () => {
    // -- Arrange: raw-result stub seeded with the one raw result the job references
    const rawResultStore = new StubRawResultStore(
      new Map([[RAW_RESULT_ID, makeSeededRawResult()]]),
    );

    // -- Arrange: real ProposalBuilder / ProposalOrchestrator / ProposalProductionStage
    const proposalBuilder = new ProposalBuilder([new GoogleMapsProviderMapper()]);
    const proposalStore = new StubProposalStore();
    const proposalOrchestrator = new ProposalOrchestrator(
      rawResultStore,
      proposalBuilder,
      proposalStore,
    );
    const proposalProductionStage = new ProposalProductionStage(proposalOrchestrator);

    // -- Arrange: real InMemoryQueue, seeded with exactly one job
    const proposalProductionQueue = new InMemoryQueue<ProposalProductionJobPayload>(
      "proposal-production",
    );
    await proposalProductionQueue.enqueue(makeProposalJobPayload());

    // -- Arrange: real ProposalProductionCoordinator wrapping queue + stage
    const proposalProductionCoordinator = new ProposalProductionCoordinator(
      proposalProductionQueue,
      proposalProductionStage,
    );

    // -- Arrange: real RunCoordinator, normalization queue intentionally
    // empty (this test's scope is proposal-production, not normalization)
    const runStore = new StubRunStore();
    runStore.seed(makeRun());
    const recordStore = new StubRecordStore();
    const lifecycle = new RunLifecycleService(runStore, recordStore);
    const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
    const normalizationQueue = new InMemoryQueue<NormalizationJobPayload>("norm");

    const coordinator = new RunCoordinator(
      lifecycle,
      normalizer,
      normalizationQueue,
      { fetchRawResult: async () => null, pollIntervalMs: 0 },
      proposalProductionCoordinator,
    );

    // -- Act
    await coordinator.execute(RUN_ID);

    // -- Assert 1: ProposalProductionCoordinator.drain() actually processed the queued job
    expect(proposalProductionCoordinator.stats.processed).toBe(1);
    expect(proposalProductionCoordinator.stats.succeeded).toBe(1);

    // -- Assert 2-4: real chain reached IProposalStore.save() exactly once
    expect(proposalStore.saved).toHaveLength(1);
    const savedProposal = proposalStore.saved[0] as IdentityProposal;

    // -- Assert 5: the saved proposal is a well-formed IdentityProposal
    expect(savedProposal).toBeDefined();
    expect(typeof savedProposal.candidateFingerprint).toBe("string");
    expect(savedProposal.candidateFingerprint.length).toBeGreaterThan(0);

    // -- Assert 6: rawResultId lineage matches the seeded raw result
    expect(savedProposal.rawResultId).toBe(RAW_RESULT_ID);

    // -- Assert 7: important fields derived from the raw result are correct
    expect(savedProposal.name).toBe("Ace Plumbers Ltd");
    expect(savedProposal.website).toBe("https://aceplumbers.ng");
    expect(savedProposal.address?.raw).toBe("1 Marina, Lagos Island, Lagos, Nigeria");
    expect(savedProposal.externalIds?.googlePlaceId).toBe("ChIJ123");
    expect(savedProposal.sourceProvider).toBe("google-maps");
    expect(savedProposal.runId).toBe(RUN_ID);
    expect(savedProposal.queryId).toBe(QUERY_ID);

    // -- Assert 8: the run completed successfully
    const finalRun = await runStore.getById(RUN_ID);
    expect(finalRun?.status).toBe("complete");
    expect(finalRun?.completedAt).toBeInstanceOf(Date);

    // -- Assert 9: the proposal-production queue is empty after execution
    const depthAfter = await proposalProductionQueue.depth();
    expect(depthAfter.ok ? depthAfter.value : -1).toBe(0);
  });
});