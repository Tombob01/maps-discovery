/**
 * @module tests/unit/runtime/RunWatchdog.test
 *
 * Unit tests for RunWatchdog.
 * No real DB, no Playwright, no wall-clock time.
 * Clock is injected via nowMs option for deterministic behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunWatchdog } from "../../../src/runtime/RunWatchdog.js";
import type { IRunStore } from "../../../src/storage/IRunStore.js";
import type { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import type { Run } from "../../../src/core/models/Job.js";
import type { RunID } from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1_000_000_000_000; // fixed epoch ms for all tests
const TWO_HOURS_MS = 7_200_000;
const FIFTEEN_MIN_MS = 900_000;

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-001" as RunID,
    status: "running",
    startedAt: new Date(NOW - TWO_HOURS_MS - 1), // 1 ms past threshold
    completedAt: null,
    createdAt: new Date(NOW - TWO_HOURS_MS - 1),
    config: {
      runId: "run-001" as RunID,
      seeds: [],
      providerIds: [],
      forceReprocess: false,
    },
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

function makeRunStore(runs: Run[] = []): IRunStore {
  return {
    create: vi.fn(),
    getById: vi.fn().mockImplementation(async (id: string) =>
      runs.find((r) => r.id === id) ?? null,
    ),
    list: vi.fn().mockResolvedValue(runs),
    listStaleRunning: vi.fn().mockImplementation(async (olderThan: Date) =>
      runs.filter(
        (r) =>
          r.status === "running" &&
          r.startedAt !== null &&
          r.startedAt.getTime() < olderThan.getTime(),
      ),
    ),
    listStalePending: vi.fn().mockImplementation(async (olderThan: Date) =>
      runs.filter(
        (r) =>
          r.status === "pending" &&
          r.startedAt !== null &&
          r.startedAt.getTime() < olderThan.getTime(),
      ),
    ),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function makeLifecycle(): RunLifecycleService {
  return {
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn().mockResolvedValue(undefined),
    incrementStats: vi.fn(),
    persistRecords: vi.fn(),
  } as unknown as RunLifecycleService;
}

function makeWatchdog(
  runs: Run[],
  lifecycleOverride?: RunLifecycleService,
  storeOverride?: IRunStore,
) {
  const store = storeOverride ?? makeRunStore(runs);
  const lifecycle = lifecycleOverride ?? makeLifecycle();
  const watchdog = new RunWatchdog(store, lifecycle, {
    maxRunAgeMs: TWO_HOURS_MS,
    scanIntervalMs: 60_000,
    nowMs: () => NOW,
  });
  return { watchdog, store, lifecycle };
}

// ---------------------------------------------------------------------------
// _scanOnce � core logic
// ---------------------------------------------------------------------------

describe("RunWatchdog._scanOnce", () => {
  it("does not fail a fresh pending run (startedAt within maxPendingAgeMs)", async () => {
    // A pending run younger than the pending threshold must NOT be failed.
    const run = makeRun({
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS + 1000), // 1 second before threshold
    });
    const store = makeRunStore([run]);
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      maxPendingAgeMs: FIFTEEN_MIN_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("does not fail a complete run", async () => {
    const run = makeRun({ status: "complete", completedAt: new Date(NOW - 1000) });
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("does not fail a failed run", async () => {
    const run = makeRun({ status: "failed", completedAt: new Date(NOW - 1000) });
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("does not fail a running run whose startedAt is within the threshold", async () => {
    const run = makeRun({
      startedAt: new Date(NOW - TWO_HOURS_MS + 1000), // 1 second before threshold
    });
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("does not fail a running run with null startedAt", async () => {
    const run = makeRun({ startedAt: null });
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("fails a running run whose startedAt exceeds the threshold", async () => {
    const run = makeRun(); // startedAt is NOW - TWO_HOURS_MS - 1
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).toHaveBeenCalledOnce();
    expect(lifecycle.fail).toHaveBeenCalledWith("run-001", { errors: 1 });
  });

  it("fails all stale running runs when multiple are present", async () => {
    const runs = [
      makeRun({ id: "run-001" as RunID }),
      makeRun({ id: "run-002" as RunID }),
      makeRun({ id: "run-003" as RunID }),
    ];
    const store = makeRunStore(runs);
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).toHaveBeenCalledTimes(3);
  });

  it("returns correct failed and skipped counts", async () => {
    const run = makeRun();
    const { watchdog } = makeWatchdog([run]);
    const result = await watchdog._scanOnce("test");
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Race-condition guard � re-read before fail
// ---------------------------------------------------------------------------

describe("RunWatchdog race-condition guard", () => {
  it("skips a run that completed between list scan and re-read", async () => {
    const staleRun = makeRun({ id: "run-001" as RunID });

    // list() returns the stale run, but getById returns it as complete
    const freshRun = makeRun({
      id: "run-001" as RunID,
      status: "complete",
      completedAt: new Date(NOW - 100),
    });
    const store: IRunStore = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([staleRun]),
      listStaleRunning: vi.fn().mockResolvedValue([staleRun]),
      listStalePending: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(freshRun),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });

    const result = await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("skips a run that disappeared between list scan and re-read", async () => {
    const staleRun = makeRun({ id: "run-001" as RunID });
    const store: IRunStore = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([staleRun]),
      listStaleRunning: vi.fn().mockResolvedValue([staleRun]),
      listStalePending: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null), // disappeared
      update: vi.fn(),
      delete: vi.fn(),
    };
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });

    const result = await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// recoverStaleRuns � startup recovery
// ---------------------------------------------------------------------------

describe("RunWatchdog.recoverStaleRuns", () => {
  it("fails stale runs on startup", async () => {
    const run = makeRun();
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog.recoverStaleRuns();
    expect(lifecycle.fail).toHaveBeenCalledOnce();
  });

  it("does not fail fresh running runs on startup", async () => {
    const run = makeRun({
      startedAt: new Date(NOW - 1000), // 1 second old
    });
    const { watchdog, lifecycle } = makeWatchdog([run]);
    await watchdog.recoverStaleRuns();
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Periodic scan � start / stop
// ---------------------------------------------------------------------------

describe("RunWatchdog start/stop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("calls _scanOnce after one interval tick", async () => {
    const run = makeRun();
    const { watchdog, lifecycle } = makeWatchdog([run]);
    const stop = watchdog.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(lifecycle.fail).toHaveBeenCalled();
    stop();
  });

  it("does not call _scanOnce after stop()", async () => {
    const run = makeRun();
    const { watchdog, lifecycle } = makeWatchdog([run]);
    const stop = watchdog.start();
    stop();

    await vi.advanceTimersByTimeAsync(60_000 * 5);

    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it("throws if start() is called twice", () => {
    const { watchdog } = makeWatchdog([]);
    const stop = watchdog.start();
    expect(() => watchdog.start()).toThrow("RunWatchdog.start() called more than once");
    stop();
  });

  it("stop() is safe to call before start()", () => {
    const { watchdog } = makeWatchdog([]);
    expect(() => watchdog.stop()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Stale pending run recovery
// ---------------------------------------------------------------------------

describe("RunWatchdog._scanOnce -- stale pending recovery", () => {
  function makePendingWatchdog(runs: Run[], lifecycleOverride?: RunLifecycleService) {
    const store = makeRunStore(runs);
    const lifecycle = lifecycleOverride ?? makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      maxPendingAgeMs: FIFTEEN_MIN_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    return { watchdog, store, lifecycle };
  }

  it("fails a stale pending run whose startedAt exceeds maxPendingAgeMs", async () => {
    const run = makeRun({
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS - 1), // 1 ms past threshold
    });
    const { watchdog, lifecycle } = makePendingWatchdog([run]);
    await watchdog._scanOnce("test");
    expect(lifecycle.fail).toHaveBeenCalledOnce();
  });

  it("calls lifecycle.fail() without partialStats for pending runs", async () => {
    const run = makeRun({
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS - 1),
    });
    const { watchdog, lifecycle } = makePendingWatchdog([run]);
    await watchdog._scanOnce("test");
    // Second argument must be undefined -- no partialStats for pending runs
    expect(lifecycle.fail).toHaveBeenCalledWith("run-001");
    expect(lifecycle.fail).toHaveBeenCalledWith(
      expect.any(String),
      // ensure no second argument was passed
    );
    const call = (lifecycle.fail as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call).toHaveLength(1);
  });

  it("skips a pending run that transitioned to running between list and re-read", async () => {
    const staleRun = makeRun({
      id: "run-pending-race" as RunID,
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS - 1),
    });
    const freshRun = makeRun({
      id: "run-pending-race" as RunID,
      status: "running", // transitioned between list and re-read
    });
    const store: IRunStore = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([staleRun]),
      listStaleRunning: vi.fn().mockResolvedValue([]),
      listStalePending: vi.fn().mockResolvedValue([staleRun]),
      getById: vi.fn().mockResolvedValue(freshRun),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      maxPendingAgeMs: FIFTEEN_MIN_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    const result = await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("skips a pending run that transitioned to complete between list and re-read", async () => {
    const staleRun = makeRun({
      id: "run-pending-complete" as RunID,
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS - 1),
    });
    const freshRun = makeRun({
      id: "run-pending-complete" as RunID,
      status: "complete",
      completedAt: new Date(NOW - 100),
    });
    const store: IRunStore = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([staleRun]),
      listStaleRunning: vi.fn().mockResolvedValue([]),
      listStalePending: vi.fn().mockResolvedValue([staleRun]),
      getById: vi.fn().mockResolvedValue(freshRun),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      maxPendingAgeMs: FIFTEEN_MIN_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    const result = await watchdog._scanOnce("test");
    expect(lifecycle.fail).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("recovers both stale running and stale pending runs in the same scan", async () => {
    const runningRun = makeRun({
      id: "run-stale-running" as RunID,
      status: "running",
      startedAt: new Date(NOW - TWO_HOURS_MS - 1),
    });
    const pendingRun = makeRun({
      id: "run-stale-pending" as RunID,
      status: "pending",
      startedAt: new Date(NOW - FIFTEEN_MIN_MS - 1),
    });
    const store = makeRunStore([runningRun, pendingRun]);
    const lifecycle = makeLifecycle();
    const watchdog = new RunWatchdog(store, lifecycle, {
      maxRunAgeMs: TWO_HOURS_MS,
      maxPendingAgeMs: FIFTEEN_MIN_MS,
      scanIntervalMs: 60_000,
      nowMs: () => NOW,
    });
    const result = await watchdog._scanOnce("test");
    expect(lifecycle.fail).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
    // Running run gets { errors: 1 }; pending run gets no partialStats
    const calls = (lifecycle.fail as ReturnType<typeof vi.fn>).mock.calls;
    const runningCall = calls.find((c) => c[0] === "run-stale-running")!;
    const pendingCall = calls.find((c) => c[0] === "run-stale-pending")!;
    expect(runningCall[1]).toEqual({ errors: 1 });
    expect(pendingCall).toHaveLength(1); // no second arg
  });
});

// ---------------------------------------------------------------------------
// Failure reason constant
// ---------------------------------------------------------------------------

describe("RunWatchdog.FAILURE_REASON", () => {
  it('is exactly "Run exceeded watchdog timeout."', () => {
    expect(RunWatchdog.FAILURE_REASON).toBe("Run exceeded watchdog timeout.");
  });
});

