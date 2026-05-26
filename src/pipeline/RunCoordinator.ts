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
   *   pending → running → (drain queue) → complete | failed
   *
   * Returns the final RunStats collected during this execution.
   * Throws (after persisting "failed") if an unrecoverable error occurs.
   */
  async execute(runId: RunID): Promise<RunStats> {
    // 1. Transition to running
    const runningRun = await this.lifecycle.start(runId);

    // Accumulate stats locally; flush to DB via incrementStats after each record.
    // This avoids N separate DB round-trips for the final stats write —
    // the complete() call writes them all at once.
    let accumulated: RunStats = { ...runningRun.stats };

    // 2. Build the normalization stage with persistence wired into onSuccess
    const stage = new NormalizationStage(this.normalizer, {
      fetchRawResult: (id) => this.opts.fetchRawResult(id),

      onSuccess: async (
        record: BusinessRecord,
        payload: NormalizationJobPayload,
      ) => {
        // Persist the record (idempotent — ON CONFLICT DO NOTHING)
        await this.lifecycle.persistRecords([record]);

        // Increment stats in DB so a crash mid-run leaves accurate counts
        await this.lifecycle.incrementStats(payload.runId, {
          recordsNormalized: 1,
          rawResultsFound: 1,
        });

        // Mirror in local accumulator for the final complete() call
        accumulated = {
          ...accumulated,
          recordsNormalized: accumulated.recordsNormalized + 1,
          rawResultsFound: accumulated.rawResultsFound + 1,
        };
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
      // Unrecoverable error — persist failed status with whatever stats we have
      await this.lifecycle
        .fail(runId, {
          errors: accumulated.errors + 1,
        })
        .catch(() => {
          // Best-effort — don't mask the original error
        });
      throw err;
    }

    // 4. Incorporate runner stats (skips, dead-letters, failures) into final counts
    accumulated = {
      ...accumulated,
      errors:
        accumulated.errors + runner.stats.failed + runner.stats.deadLettered,
    };

    // 5. Transition to complete with final stats
    await this.lifecycle.complete(runId, accumulated);

    return accumulated;
  }
}
