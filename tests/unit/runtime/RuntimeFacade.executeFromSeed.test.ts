/**
 * @module tests/unit/runtime/RuntimeFacade.executeFromSeed
 *
 * Tests for RuntimeFacade.executeFromSeed():
 *   - Builds a QuerySeed from keyword + location string
 *   - Delegates to QueryEngine.generate()
 *   - Assembles ResolvedQuery and calls RuntimeExecutor.execute()
 *   - Propagates QueryEngine errors as thrown exceptions
 *   - RuntimeExecutor receives a properly-typed ResolvedQuery
 *   - Geo fallback: zero coordinates used when geo resolution fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";
import { PassthroughGeoResolver } from "../../../src/query-engine/GeoResolver.js";
import { ResolvedQueryFactory } from "../../../src/query-engine/ResolvedQueryFactory.js";
import { QUERY_ENGINE_DEFAULTS } from "../../../src/query-engine/config/QueryEngineConfig.js";
import { StaticCoordinateGeoResolver } from "../../../src/query-engine/GeoResolver.js";
import {
  createQueryEngine,
  buildQueryEngineConfig,
} from "../../../src/query-engine/index.js";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
import type { RunService } from "../../../src/api/RunService.js";
import type { RuntimeExecutor, ExecutionSummary } from "../../../src/runtime/RuntimeExecutor.js";
import type { KeywordExpansionService } from "../../../src/ai/KeywordExpansionService.js";
import type { QueryEngine } from "../../../src/query-engine/QueryEngine.js";
import type { IProvider, ProviderCapabilities } from "../../../src/core/interfaces/IProvider.js";
import type { RunID } from "../../../src/core/types/common.js";
import type { RunStats } from "../../../src/core/models/Job.js";
import type { ScrapingPolicy } from "../../../src/core/types/rate-limit.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_RUN_ID = "run-seed-test-001" as RunID;

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

const STUB_SUMMARY: ExecutionSummary = {
  discovery: { resultsCollected: 0, resultsSaved: 0, jobsEnqueued: 0, errors: 0 },
  normalization: ZERO_RUN_STATS,
};

function makeMockProvider(id = "google-maps"): IProvider {
  return {
    id,
    displayName: id,
    capabilities: {} as ProviderCapabilities,
    policy: {} as ScrapingPolicy,
    checkHealth: async () => ({ status: "healthy" as const }),
    shutdown: async () => {},
    discover: async function* () {},
  };
}

function makeMockExecutor(): RuntimeExecutor {
  return {
    execute: vi.fn().mockResolvedValue(STUB_SUMMARY),
  } as unknown as RuntimeExecutor;
}

function makeMockRunService(): RunService {
  return {} as unknown as RunService;
}

function makeMockExpansionService(): KeywordExpansionService {
  return {} as unknown as KeywordExpansionService;
}

// Build a real QueryEngine wired against the project's own dictionaries.
// This is deliberately a real engine (not a mock) so we test the actual
// generate() path without network or DB.
function makeRealQueryEngine(
  staticCoords?: Readonly<Record<string, { lat: number; lng: number }>>,
): { engine: QueryEngine; geoResolver: PassthroughGeoResolver } {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const dictionariesBase = resolvePath(
    __dirname,
    "../../../src/query-engine/dictionaries",
  );
  const config = buildQueryEngineConfig({
    nicheDictionariesDir: dictionariesBase,
    geoDictionariesDir: dictionariesBase,
  });
  const assembled = createQueryEngine({
    config,
    ...(staticCoords !== undefined ? { staticCoordinates: staticCoords } : {}),
  });
  const geoResolver = new PassthroughGeoResolver(config.geoResolver);
  return { engine: assembled.engine, geoResolver };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RuntimeFacade.executeFromSeed", () => {
  let executor: RuntimeExecutor;
  let provider: IProvider;

  beforeEach(() => {
    executor = makeMockExecutor();
    provider = makeMockProvider();
  });

  it("calls RuntimeExecutor.execute with a valid ResolvedQuery", async () => {
    const { engine, geoResolver } = makeRealQueryEngine({
      "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 },
    });
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    await facade.executeFromSeed({
      provider,
      runId: TEST_RUN_ID,
      keyword: "plumbers",
      location: "Lagos, Nigeria",
    });

    expect(executor.execute).toHaveBeenCalledOnce();
    const callArg = vi.mocked(executor.execute).mock.calls[0]![0];
    expect(callArg.runId).toBe(TEST_RUN_ID);
    expect(callArg.provider).toBe(provider);
    expect(callArg.query).toBeDefined();
    expect(callArg.query.resolvedGeoTarget).toBeDefined();
  });

  it("ResolvedQuery.rawText contains niche and location", async () => {
    const { engine, geoResolver } = makeRealQueryEngine({
      "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 },
    });
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    await facade.executeFromSeed({
      provider,
      runId: TEST_RUN_ID,
      keyword: "plumbers",
      location: "Lagos, Nigeria",
    });

    const callArg = vi.mocked(executor.execute).mock.calls[0]![0];
    expect(callArg.query.rawText.toLowerCase()).toContain("plumbers");
    expect(callArg.query.rawText.toLowerCase()).toContain("lagos");
  });

  it("returns the ExecutionSummary from RuntimeExecutor", async () => {
    const { engine, geoResolver } = makeRealQueryEngine({
      "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 },
    });
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    const result = await facade.executeFromSeed({
      provider,
      runId: TEST_RUN_ID,
      keyword: "plumbers",
      location: "Lagos, Nigeria",
    });

    expect(result).toEqual(STUB_SUMMARY);
  });

  it("throws when QueryEngine.generate returns an error", async () => {
    // Build engine but pass an empty niche to trigger INVALID_SEED
    const { engine, geoResolver } = makeRealQueryEngine();
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    await expect(
      facade.executeFromSeed({
        provider,
        runId: TEST_RUN_ID,
        keyword: "   ",          // blank niche → INVALID_SEED
        location: "Lagos",
      }),
    ).rejects.toThrow(/INVALID_SEED/);
  });

  it("throws when location cannot be resolved by the query engine", async () => {
    // "Unknown City, XYZ" won't resolve via country centroid table.
    // QueryEngine.generate() returns GEO_RESOLUTION_FAILED, which executeFromSeed
    // converts to a thrown error.
    const { engine, geoResolver } = makeRealQueryEngine(); // no static coords
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    await expect(
      facade.executeFromSeed({
        provider,
        runId: TEST_RUN_ID,
        keyword: "lawyers",
        location: "Unknown City, XYZ",
      }),
    ).rejects.toThrow(/GEO_RESOLUTION_FAILED/);

    // Executor must NOT have been called when seed resolution fails
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("uses real geo coordinates when location resolves via country centroid", async () => {
    const { engine, geoResolver } = makeRealQueryEngine();
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    // "nigeria" resolves via country-name lookup in PassthroughGeoResolver
    await facade.executeFromSeed({
      provider,
      runId: TEST_RUN_ID,
      keyword: "electricians",
      location: "nigeria",
    });

    expect(executor.execute).toHaveBeenCalledOnce();
    const callArg = vi.mocked(executor.execute).mock.calls[0]![0];
    const coords = callArg.query.resolvedGeoTarget.resolvedCoordinates;
    expect(coords.lat).not.toBe(0);
    expect(coords.lng).not.toBe(0);
  });

  it("passes runId through to the generated query", async () => {
    const { engine, geoResolver } = makeRealQueryEngine({
      "Austin, TX": { lat: 30.2672, lng: -97.7431 },
    });
    const specificRunId = "run-specific-42" as RunID;
    const facade = new RuntimeFacade(
      makeMockRunService(),
      executor,
      makeMockExpansionService(),
      engine,
      geoResolver,
      new ResolvedQueryFactory(),
    );

    await facade.executeFromSeed({
      provider,
      runId: specificRunId,
      keyword: "dentists",
      location: "Austin, TX",
    });

    const callArg = vi.mocked(executor.execute).mock.calls[0]![0];
    expect(callArg.runId).toBe(specificRunId);
    expect(callArg.query.runId).toBe(specificRunId);
  });
});
