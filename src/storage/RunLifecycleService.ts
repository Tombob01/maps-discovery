/**
 * @module storage/RunLifecycleService
 *
 * Manages the persistence lifecycle of a pipeline Run:
 *   start()    → status "running",  startedAt = now
 *   complete() → status "complete", completedAt = now, final stats written
 *   fail()     → status "failed",   completedAt = now, stats-so-far preserved
 *
 * Also owns batch persistence of BusinessRecord objects produced during
 * the normalization stage.
 *
 * Design:
 *   - Pure constructor injection — no globals, no singletons.
 *   - All mutations go through IRunStore.update() so the DB is the single
 *     source of truth for run state.
 *   - persistRecords() batches writes in configurable chunk sizes to avoid
 *     oversized INSERT statements (default: 100 records per batch).
 *   - Thread safety: callers are responsible for ensuring only one writer
 *     per runId at a time (enforced by the job queue at the application level).
 */

import type { Run, RunStats } from "../core/models/Job.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { RunID } from "../core/types/common.js";
import type { IRunStore } from "./IRunStore.js";
import type { IRecordStore } from "./IRecordStore.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RunLifecycleServiceOptions {
  /**
   * Maximum number of records written in a single INSERT.
   * Lower values reduce memory pressure; higher values reduce round-trips.
   * Default: 100.
   */
  readonly batchSize?: number;
}

// ---------------------------------------------------------------------------
// RunLifecycleService
// ---------------------------------------------------------------------------

export class RunLifecycleService {
  private readonly runStore: IRunStore;
  private readonly recordStore: IRecordStore;
  private readonly batchSize: number;

  constructor(
    runStore: IRunStore,
    recordStore: IRecordStore,
    opts: RunLifecycleServiceOptions = {},
  ) {
    this.runStore = runStore;
    this.recordStore = recordStore;
    this.batchSize = opts.batchSize ?? 100;
  }

  // ---------------------------------------------------------------------------
  // start — transition pending → running
  // ---------------------------------------------------------------------------

  /**
   * Marks a run as running. The run must already exist in the store
   * (created by RunService.createRun with status "pending").
   *
   * Throws if the run does not exist.
   */
  async start(runId: RunID): Promise<Run> {
    const run = await this.runStore.getById(runId);
    if (run === null) {
      throw new Error(
        `RunLifecycleService.start: run "${runId}" not found`,
      );
    }

    const updated: Run = {
      ...run,
      status: "running",
      startedAt: run.startedAt ?? new Date(),
    };

    await this.runStore.update(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // complete — transition running → complete
  // ---------------------------------------------------------------------------

  /**
   * Marks a run as complete and writes the final stats.
   * Sets completedAt to now.
   *
   * Throws if the run does not exist.
   */
  async complete(runId: RunID, finalStats: RunStats): Promise<Run> {
    const run = await this.runStore.getById(runId);
    if (run === null) {
      throw new Error(
        `RunLifecycleService.complete: run "${runId}" not found`,
      );
    }

    const updated: Run = {
      ...run,
      status: "complete",
      completedAt: new Date(),
      stats: finalStats,
    };

    await this.runStore.update(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // fail — transition any → failed
  // ---------------------------------------------------------------------------

  /**
   * Marks a run as failed, preserving whatever stats were accumulated.
   * Merges partialStats on top of the run's current stats (additive).
   * Sets completedAt to now.
   *
   * Safe to call even if the run is already failed (idempotent for the
   * status field; stats will still be merged).
   *
   * Throws if the run does not exist.
   */
  async fail(runId: RunID, partialStats?: Partial<RunStats>): Promise<Run> {
    const run = await this.runStore.getById(runId);
    if (run === null) {
      throw new Error(
        `RunLifecycleService.fail: run "${runId}" not found`,
      );
    }

    const mergedStats: RunStats = partialStats !== undefined
      ? mergeStats(run.stats, partialStats)
      : run.stats;

    const updated: Run = {
      ...run,
      status: "failed",
      completedAt: run.completedAt ?? new Date(),
      stats: mergedStats,
    };

    await this.runStore.update(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // incrementStats — apply an additive stats delta mid-run
  // ---------------------------------------------------------------------------

  /**
   * Applies an additive delta to a run's stats without changing its status.
   * Use this to update counters as each normalization/export job completes.
   *
   * Throws if the run does not exist.
   */
  async incrementStats(
    runId: RunID,
    delta: Partial<RunStats>,
  ): Promise<Run> {
    const run = await this.runStore.getById(runId);
    if (run === null) {
      throw new Error(
        `RunLifecycleService.incrementStats: run "${runId}" not found`,
      );
    }

    const updated: Run = {
      ...run,
      stats: mergeStats(run.stats, delta),
    };

    await this.runStore.update(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // persistRecords — batch-insert BusinessRecord objects
  // ---------------------------------------------------------------------------

  /**
   * Persists an array of BusinessRecord objects in batches of `batchSize`.
   *
   * Uses IRecordStore.insertMany() with ON CONFLICT DO NOTHING semantics,
   * so re-running is safe (idempotent given stable record IDs).
   *
   * Returns the total number of records handed to insertMany (some may have
   * been silently skipped by the DB due to duplicate IDs).
   */
  async persistRecords(records: readonly BusinessRecord[]): Promise<number> {
    if (records.length === 0) return 0;

    let written = 0;
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      await this.recordStore.insertMany(batch);
      written += batch.length;
    }

    return written;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Additive merge: applies delta values on top of base.
 * Only numeric stats fields are merged; undefined delta fields are ignored.
 */
function mergeStats(base: RunStats, delta: Partial<RunStats>): RunStats {
  return {
    queriesGenerated:
      base.queriesGenerated + (delta.queriesGenerated ?? 0),
    queriesDispatched:
      base.queriesDispatched + (delta.queriesDispatched ?? 0),
    rawResultsFound:
      base.rawResultsFound + (delta.rawResultsFound ?? 0),
    recordsNormalized:
      base.recordsNormalized + (delta.recordsNormalized ?? 0),
    recordsUnique:
      base.recordsUnique + (delta.recordsUnique ?? 0),
    recordsDuplicate:
      base.recordsDuplicate + (delta.recordsDuplicate ?? 0),
    recordsExported:
      base.recordsExported + (delta.recordsExported ?? 0),
    errors:
      base.errors + (delta.errors ?? 0),
  };
}
