/**
 * @module tests/unit/runtime/ExecutionReporter
 *
 * Tests for ExecutionReporter and RuntimeExecutor observability:
 *   - emits started and completed events in order
 *   - emits execution_failed on coordinator throw
 *   - ExecutionSummary is unchanged when reporter is active
 *   - reporter throw does not propagate into execution
 */

import { describe, it, expect, vi } from "vitest";
import { ExecutionReporter, NoopExecutionReporter } from "../../../src/runtime/ExecutionReporter.js";
import { RuntimeExecutor } from "../../../src/runtime/RuntimeExecutor.js";
import type { DiscoveryRunner, DiscoveryStats } from "../../../src/runtime/DiscoveryRunner.js";
import type { RunCoordinator } from "../../../src/pipeline/RunCoordinator.js";
import type { RunStats } from "../../../src/core/models/Job.js";
import type { IProvider, ProviderCapabilities, ProviderHealth } from "../../../src/core/interfaces/IProvider.js";
import type { ResolvedQuery } from "../../../src/core/models/Query.js";
import type { RunID } from "../../../src/core/types/common.js";
import type { ScrapingPolicy } from "../../../src/core/types/rate-limit.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_RUN_ID = "run-reporter-test" as RunID;

const ZERO_DISCOVERY: DiscoveryStats = {
  resultsCollected: 0,
  resultsSaved: 0,
  jobsEnqueued: 0,
  errors: 0,
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
    id: "q-1" as import("../../../src/core/types/common.js").QueryID,
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

function makeMockProvider(): IProvider {
  return {
    id: "google-maps",
    displayName: "Mock",
    capabilities: {} as ProviderCapabilities,
    policy: {} as ScrapingPolicy,
    async checkHealth(): Promise<ProviderHealth> { return { status: "healthy" }; },
    async *discover() {},
    async shutdown() {},
  };
}

function makeExecutor(
  discoveryResult: DiscoveryStats | Error,
  coordinatorResult: RunStats | Error,
  reporter?: ExecutionReporter,
): RuntimeExecutor {
  const mockRunner = {
    run: discoveryResult instanceof Error
      ? vi.fn().mockRejectedValue(discoveryResult)
      : vi.fn().mockResolvedValue(discoveryResult),
  } as unknown as DiscoveryRunner;

  const mockCoordinator = {
    execute: coordinatorResult instanceof Error
      ? vi.fn().mockRejectedValue(coordinatorResult)
      : vi.fn().mockResolvedValue(coordinatorResult),
  } as unknown as RunCoordinator;

  const factory = vi.fn().mockReturnValue(mockRunner);
  return new RuntimeExecutor(factory, mockCoordinator, reporter);
}

// ---------------------------------------------------------------------------
// ExecutionReporter unit tests
// ---------------------------------------------------------------------------

describe("ExecutionReporter", () => {
  it("starts empty", () => {
    const reporter = new ExecutionReporter();
    expect(reporter.events).toHaveLength(0);
  });

  it("accumulates events in order", () => {
    const reporter = new ExecutionReporter();
    reporter.report({ type: "execution_started", runId: TEST_RUN_ID, providerId: "google-maps", timestamp: 1 });
    reporter.report({ type: "discovery_completed", runId: TEST_RUN_ID, providerId: "google-maps", durationMs: 10, discoveryStats: ZERO_DISCOVERY, timestamp: 2 });
    expect(reporter.events).toHaveLength(2);
    expect(reporter.events[0]?.type).toBe("execution_started");
    expect(reporter.events[1]?.type).toBe("discovery_completed");
  });

  it("ofType() filters correctly", () => {
    const reporter = new ExecutionReporter();
    reporter.report({ type: "execution_started", runId: TEST_RUN_ID, providerId: "p", timestamp: 1 });
    reporter.report({ type: "execution_started", runId: TEST_RUN_ID, providerId: "p", timestamp: 2 });
    reporter.report({ type: "discovery_completed", runId: TEST_RUN_ID, providerId: "p", durationMs: 5, discoveryStats: ZERO_DISCOVERY, timestamp: 3 });
    expect(reporter.ofType("execution_started")).toHaveLength(2);
    expect(reporter.ofType("discovery_completed")).toHaveLength(1);
    expect(reporter.ofType("execution_failed")).toHaveLength(0);
  });

  it("clear() resets event list", () => {
    const reporter = new ExecutionReporter();
    reporter.report({ type: "execution_started", runId: TEST_RUN_ID, providerId: "p", timestamp: 1 });
    reporter.clear();
    expect(reporter.events).toHaveLength(0);
  });
});

describe("NoopExecutionReporter", () => {
  it("does not throw", () => {
    const noop = new NoopExecutionReporter();
    expect(() =>
      noop.report({ type: "execution_started", runId: TEST_RUN_ID, providerId: "p", timestamp: 1 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RuntimeExecutor + reporter integration
// ---------------------------------------------------------------------------

describe("RuntimeExecutor observability", () => {
  it("emits execution_started, discovery_completed, normalization_completed on success", async () => {
    const reporter = new ExecutionReporter();
    const executor = makeExecutor(ZERO_DISCOVERY, ZERO_RUN_STATS, reporter);

    await executor.execute({ provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() });

    const types = reporter.events.map((e) => e.type);
    expect(types).toEqual([
      "execution_started",
      "discovery_completed",
      "normalization_completed",
    ]);
  });

  it("emits execution_failed when coordinator throws", async () => {
    const reporter = new ExecutionReporter();
    const executor = makeExecutor(ZERO_DISCOVERY, new Error("coordinator boom"), reporter);

    await expect(
      executor.execute({ provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() }),
    ).rejects.toThrow("coordinator boom");

    const failed = reporter.ofType("execution_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toBe("coordinator boom");
  });

  it("emits execution_failed when discovery throws", async () => {
    const reporter = new ExecutionReporter();
    const executor = makeExecutor(new Error("discovery boom"), ZERO_RUN_STATS, reporter);

    await expect(
      executor.execute({ provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() }),
    ).rejects.toThrow("discovery boom");

    const failed = reporter.ofType("execution_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toBe("discovery boom");
  });

  it("ExecutionSummary is unchanged when reporter is active", async () => {
    const reporter = new ExecutionReporter();
    const dStats = { resultsCollected: 3, resultsSaved: 3, jobsEnqueued: 3, errors: 0 };
    const nStats = { ...ZERO_RUN_STATS, recordsNormalized: 3 };
    const executor = makeExecutor(dStats, nStats, reporter);

    const summary = await executor.execute({
      provider: makeMockProvider(),
      runId: TEST_RUN_ID,
      query: makeResolvedQuery(),
    });

    expect(summary.discovery).toEqual(dStats);
    expect(summary.normalization).toEqual(nStats);
  });

  it("reporter throw does not propagate into execution", async () => {
    const throwingReporter = {
      report: vi.fn().mockImplementation(() => { throw new Error("reporter exploded"); }),
    };

    const mockRunner = { run: vi.fn().mockResolvedValue(ZERO_DISCOVERY) } as unknown as DiscoveryRunner;
    const mockCoordinator = { execute: vi.fn().mockResolvedValue(ZERO_RUN_STATS) } as unknown as RunCoordinator;
    const factory = vi.fn().mockReturnValue(mockRunner);
    const executor = new RuntimeExecutor(factory, mockCoordinator, throwingReporter);

    // Should not throw despite reporter throwing on every call
    const summary = await executor.execute({
      provider: makeMockProvider(),
      runId: TEST_RUN_ID,
      query: makeResolvedQuery(),
    });

    expect(summary.discovery).toEqual(ZERO_DISCOVERY);
    expect(summary.normalization).toEqual(ZERO_RUN_STATS);
  });

  it("events carry correct runId and providerId", async () => {
    const reporter = new ExecutionReporter();
    const executor = makeExecutor(ZERO_DISCOVERY, ZERO_RUN_STATS, reporter);

    await executor.execute({ provider: makeMockProvider(), runId: TEST_RUN_ID, query: makeResolvedQuery() });

    for (const event of reporter.events) {
      expect(event.runId).toBe(TEST_RUN_ID);
      expect(event.providerId).toBe("google-maps");
    }
  });
});