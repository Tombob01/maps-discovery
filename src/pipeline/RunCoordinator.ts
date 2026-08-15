/**
 * @module pipeline/RunCoordinator
 *
 * Coordinates the full lifecycle of a single pipeline run:
 *   1. Transitions the run to "running" via RunLifecycleService.
 *   2. Wires NormalizationStage.onSuccess to persist BusinessRecords
 *      and increment per-run stats.
 *   3. Drives the stage via PipelineRunner.drain().
 *   4. On clean completion: transitions the run to "complete".
 *   5. On any thrown error: transitions the run to "failed" then re-throws.
 *
 * Design:
 *   - RunCoordinator is the ONLY place that calls RunLifecycleService
 *     start/complete/fail in the runtime path.
 *   - PipelineRunner and NormalizationStage remain pure and unchanged.
 *   - Persistence is injected; RunCoordinator has no direct DB dependency.
 *   - Safe to call multiple times on different runIds (no shared state).
 *
 * Idempotency:
 *   - RunLifecycleService.start() is idempotent if startedAt is already set.
 *   - NormalizationStage uses ON CONFLICT DO NOTHING via insertMany.
 *   - Crashing mid-drain and retrying is safe: already-persisted records
 *     are silently skipped; stats may be slightly over-counted on retry
 *     (acceptable until a deduplication pass is added).
 */

import type { RunID } from "../core/types/common.js";
import type { NormalizationJobPayload, RunStats } from "../core/models/Job.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { INormalizer } from "../core/interfaces/INormalizer.js";
import type { IQueue } from "../queue/IQueue.js";
import type { RunLifecycleService } from "../storage/RunLifecycleService.js";
import { NormalizationStage } from "./NormalizationStage.js";
import { PipelineRunner } from "./PipelineRunner.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RunCoordinatorOptions {
  /**
   * Fetches a raw ProviderResult by its ID.
   * In production: reads from the raw_results DB table.
   * In tests: reads from an in-memory map.
   */
  fetchRawResult(rawResultId: string): Promise<ProviderResult | null>;

  /**
   * Milliseconds between queue polls when the queue is empty.
   * Forwarded to PipelineRunner. Default: 500.
   */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// RunCoordinator
// ---------------------------------------------------------------------------

/**
 * Additive, optional batch-position information for execute().
 *
 * Added to support multi-seed batches (a single runId driven through
 * multiple sequential DiscoveryRunner + RunCoordinator.execute() calls,
 * one per seed -- see server.ts's /execute loop). When omitted entirely,
 * execute() behaves exactly as it always has: every call performs the
 * terminal lifecycle transition (complete or failed).
 */
export interface RunCoordinatorBatchOptions {
  /**
   * Whether this call is the LAST seed in a multi-seed batch.
   * - true or omitted (default): execute() performs the terminal
   *   transition (complete/fail) exactly as before.
   * - false: execute() persists stats/records normally but does NOT
   *   transition the run's status or completedAt -- a later seed's
   *   execute() call owns the batch's terminal transition.
   */
  readonly isLastSeed?: boolean;

  /**
   * Whether an earlier seed in this batch already failed.
   * Only consulted when isLastSeed is true (or omitted). When true, the
   * final transition is lifecycle.fail() even if THIS seed's own drain
   * completed cleanly -- a later successful seed must never overwrite an
   * earlier seed's failure with "complete" (Option II).
   * Default: false.
   */
  readonly batchFailed?: boolean;
}

export class RunCoordinator {
  constructor(
    private readonly lifecycle: RunLifecycleService,
    private readonly normalizer: INormalizer,
    private readonly queue: IQueue<NormalizationJobPayload>,
    private readonly opts: RunCoordinatorOptions,
  ) {}

  /**
   * Executes all normalization jobs for a run end-to-end:
   *
   *   pending -> running -> (drain queue) -> complete | failed
   *
   * Returns the final RunStats collected during this execution.
   * Throws (after persisting "failed") if an unrecoverable error occurs.
   */
  async execute(
    runId: RunID,
    batchOpts?: RunCoordinatorBatchOptions,
  ): Promise<RunStats> {
    const isLastSeed = batchOpts?.isLastSeed ?? true;
    const batchFailed = batchOpts?.batchFailed ?? false;

    // 1. Transition to running
    const runningRun = await this.lifecycle.start(runId);

    // Accumulate stats locally; flush to DB via incrementStats after each record.
    // This avoids N separate DB round-trips for the final stats write -
    // the complete() call writes them all at once.
    let accumulated: RunStats = { ...runningRun.stats };

    // 2. Build the normalization stage with persistence wired into onSuccess
    const stage = new NormalizationStage(this.normalizer, {
      fetchRawResult: (id) => this.opts.fetchRawResult(id),

      onSuccess: async (
        record: BusinessRecord,
        payload: NormalizationJobPayload,
      ) => {
        // Persist the record (idempotent - ON CONFLICT DO NOTHING)
        const inserted = await this.lifecycle.persistRecords([record]);

        // Every successful normalization counts, regardless of insert outcome.
        await this.lifecycle.incrementStats(payload.runId, {
          recordsNormalized: 1,
          rawResultsFound: 1,
        });
        accumulated = {
          ...accumulated,
          recordsNormalized: accumulated.recordsNormalized + 1,
          rawResultsFound: accumulated.rawResultsFound + 1,
        };

        if (inserted > 0) {
          // New row written to DB
          await this.lifecycle.incrementStats(payload.runId, {
            recordsUnique: 1,
          });
          accumulated = {
            ...accumulated,
            recordsUnique: accumulated.recordsUnique + 1,
          };
        } else {
          // Fingerprint already existed - cross-run duplicate
          await this.lifecycle.incrementStats(payload.runId, {
            recordsDuplicate: 1,
          });
          accumulated = {
            ...accumulated,
            recordsDuplicate: accumulated.recordsDuplicate + 1,
          };
        }
      },
    });

    // 3. Drive the stage to completion
    const runner = new PipelineRunner(
      this.queue,
      stage,
      this.opts.pollIntervalMs !== undefined
        ? { pollIntervalMs: this.opts.pollIntervalMs }
        : {},
    );

    try {
      await runner.drain();
    } catch (err) {
      if (isLastSeed) {
        // Unrecoverable error on the batch's terminal seed - persist
        // failed status with whatever stats we have.
        await this.lifecycle
          .fail(runId, {
            errors: accumulated.errors + 1,
          })
          .catch(() => {
            // Best-effort - don't mask the original error
          });
      } else {
        // Non-terminal seed in a multi-seed batch: record the error in
        // stats, but do NOT transition status/completedAt -- a later
        // seed's execute() call owns the batch's terminal transition.
        await this.lifecycle
          .incrementStats(runId, { errors: 1 })
          .catch(() => {
            // Best-effort - don't mask the original error
          });
      }
      throw err;
    }

    // 4. Incorporate runner stats (skips, dead-letters, failures) into final counts
    accumulated = {
      ...accumulated,
      errors:
        accumulated.errors + runner.stats.failed + runner.stats.deadLettered,
    };

    // 5. Transition to a terminal status only if this is the batch's last
    // seed. Non-terminal seeds already persisted their stats incrementally
    // via onSuccess's incrementStats() calls above -- nothing further to
    // write here.
    if (isLastSeed) {
      if (batchFailed) {
        // An earlier seed in this batch already failed. This seed's own
        // work succeeded, but per Option II a later success must never
        // overwrite an earlier failure with "complete".
        await this.lifecycle.fail(runId);
      } else {
        await this.lifecycle.complete(runId, accumulated);
      }
    }

    return accumulated;
  }
}