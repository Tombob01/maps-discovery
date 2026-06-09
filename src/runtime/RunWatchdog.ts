/**
 * @module runtime/RunWatchdog
 *
 * Detects runs stuck in "running" state and marks them as failed.
 *
 * Two entry points:
 *   recoverStaleRuns() — call once at startup to fail runs left over from a
 *                        previous crashed process.
 *   start()            — begins a periodic scan; returns a stop() function.
 *
 * Staleness is determined by startedAt, not updated_at (no schema change
 * required). A run is stale when:
 *   status === "running"
 *   AND startedAt !== null
 *   AND (now - startedAt) > maxRunAgeMs
 *
 * Race-condition safety:
 *   Before calling lifecycle.fail(), the run is re-read from the store.
 *   If the status is no longer "running" (completed or failed between the
 *   scan and the re-read), the run is skipped. This prevents the watchdog
 *   from overwriting a legitimately completed run.
 *
 * Clock abstraction:
 *   nowMs is injected so tests can control time deterministically without
 *   real wall-clock dependencies.
 */

import type { IRunStore } from "../storage/IRunStore.js";
import type { RunLifecycleService } from "../storage/RunLifecycleService.js";
import type { RunID } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RunWatchdogOptions {
  /**
   * Maximum age of a running run before it is considered stuck.
   * Measured from startedAt. Default: 7_200_000 ms (2 hours).
   */
  readonly maxRunAgeMs?: number;

  /**
   * How often to scan for stale runs.
   * Default: 300_000 ms (5 minutes).
   */
  readonly scanIntervalMs?: number;

  /**
   * Injectable clock — returns current time in milliseconds.
   * Default: Date.now. Override in tests for deterministic behaviour.
   */
  readonly nowMs?: () => number;
}

// ---------------------------------------------------------------------------
// RunWatchdog
// ---------------------------------------------------------------------------

export class RunWatchdog {
  private readonly runStore: IRunStore;
  private readonly lifecycle: RunLifecycleService;
  private readonly maxRunAgeMs: number;
  private readonly scanIntervalMs: number;
  private readonly nowMs: () => number;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  static readonly FAILURE_REASON = "Run exceeded watchdog timeout.";

  constructor(
    runStore: IRunStore,
    lifecycle: RunLifecycleService,
    opts: RunWatchdogOptions = {},
  ) {
    this.runStore = runStore;
    this.lifecycle = lifecycle;
    this.maxRunAgeMs = opts.maxRunAgeMs ?? 7_200_000;
    this.scanIntervalMs = opts.scanIntervalMs ?? 300_000;
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Scans for stale runs immediately and fails them.
   * Call once at application startup before accepting requests.
   */
  async recoverStaleRuns(): Promise<void> {
    await this._scanOnce("startup-recovery");
  }

  /**
   * Starts periodic scanning.
   * Returns a stop() function — call it during graceful shutdown.
   */
  start(): () => void {
    if (this.intervalHandle !== null) {
      throw new Error("RunWatchdog.start() called more than once");
    }
    this.intervalHandle = setInterval(() => {
      void this._scanOnce("periodic").catch((err) => {
        console.error(
          "[watchdog] periodic scan error:",
          err instanceof Error ? err.message : String(err),
        );
      });
    }, this.scanIntervalMs);

    return () => {
      this.stop();
    };
  }

  /**
   * Stops the periodic scan.
   * Safe to call even if start() was never called.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Core scan logic — shared by startup recovery and periodic scans
  // ---------------------------------------------------------------------------

  /**
   * Loads all runs, identifies stale ones, and fails them one by one.
   * Re-reads each candidate immediately before failing to avoid overwriting
   * a run that completed between the list scan and the fail call.
   *
   * @internal Exposed for testing.
   */
  async _scanOnce(reason: string): Promise<{ failed: number; skipped: number }> {
    const now = this.nowMs();
    const cutoff = now - this.maxRunAgeMs;

    let runs: readonly import("../core/models/Job.js").Run[];
    try {
      runs = await this.runStore.list();
    } catch (err) {
      console.error(
        `[watchdog:${reason}] failed to list runs:`,
        err instanceof Error ? err.message : String(err),
      );
      return { failed: 0, skipped: 0 };
    }

    // First pass: identify candidates from the list snapshot
    const candidates = runs.filter(
      (r) =>
        r.status === "running" &&
        r.startedAt !== null &&
        r.startedAt.getTime() < cutoff,
    );

    let failed = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      // Re-read to guard against race: run may have completed between list
      // and now.
      let fresh: import("../core/models/Job.js").Run | null;
      try {
        fresh = await this.runStore.getById(candidate.id);
      } catch (err) {
        console.error(
          `[watchdog:${reason}] failed to re-read run ${candidate.id}:`,
          err instanceof Error ? err.message : String(err),
        );
        skipped++;
        continue;
      }

      if (fresh === null || fresh.status !== "running") {
        skipped++;
        continue;
      }

      try {
        await this.lifecycle.fail(candidate.id as RunID, { errors: 1 });
        console.warn(
          `[watchdog:${reason}] failed stale run ${candidate.id} ` +
            `(startedAt=${candidate.startedAt?.toISOString()}, ` +
            `ageMs=${now - (candidate.startedAt?.getTime() ?? now)})`,
        );
        failed++;
      } catch (err) {
        console.error(
          `[watchdog:${reason}] could not fail run ${candidate.id}:`,
          err instanceof Error ? err.message : String(err),
        );
        skipped++;
      }
    }

    if (failed > 0 || candidates.length > 0) {
      console.log(
        `[watchdog:${reason}] scan complete — candidates=${candidates.length} failed=${failed} skipped=${skipped}`,
      );
    }

    return { failed, skipped };
  }
}
