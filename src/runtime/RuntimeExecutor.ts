/**
 * @module runtime/RuntimeExecutor
 *
 * Orchestrates a full end-to-end run:
 *   1. Construct a DiscoveryRunner from the supplied provider
 *   2. Execute discovery  -> fills rawResultStore + normalizationQueue
 *   3. Execute coordinator -> drains queue, normalizes, persists records
 *   4. Return ExecutionSummary
 *
 * RuntimeExecutor is orchestration-only:
 *   - No lifecycle calls
 *   - No storage access
 *   - No normalizer access
 *   - No direct queue access
 *   - Coordinator is treated as opaque
 *   - Coordinator exceptions propagate unchanged
 *
 * Coordinator is always invoked, even when discovery yields zero results.
 *
 * Observability:
 *   - Accepts an optional IExecutionReporter (defaults to NoopExecutionReporter)
 *   - Emits structured events at execution boundaries
 *   - Reporter failures never break execution
 */

import type { IProvider, DiscoveryOptions } from "../core/interfaces/IProvider.js";
import type { ResolvedQuery } from "../core/models/Query.js";
import type { RunID } from "../core/types/common.js";
import type { RunStats } from "../core/models/Job.js";
import type { DiscoveryRunner, DiscoveryStats } from "./DiscoveryRunner.js";
import type { RunCoordinator } from "../pipeline/RunCoordinator.js";
import {
  NoopExecutionReporter,
  type IExecutionReporter,
} from "./ExecutionReporter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  readonly provider: IProvider;
  readonly runId: RunID;
  readonly query: ResolvedQuery;
  readonly discoveryOptions?: DiscoveryOptions;
}

export interface ExecutionSummary {
  readonly discovery: DiscoveryStats;
  readonly normalization: RunStats;
}

// ---------------------------------------------------------------------------
// RuntimeExecutor
// ---------------------------------------------------------------------------

export class RuntimeExecutor {
  private readonly reporter: IExecutionReporter;

  constructor(
    private readonly createDiscoveryRunner: (provider: IProvider) => DiscoveryRunner,
    private readonly coordinator: RunCoordinator,
    reporter?: IExecutionReporter,
  ) {
    this.reporter = reporter ?? new NoopExecutionReporter();
  }

  /**
   * Executes discovery then normalization for a single run.
   * Always invokes coordinator regardless of discovery result count.
   * Propagates coordinator exceptions without catching.
   */
  async execute(opts: ExecuteOptions): Promise<ExecutionSummary> {
    const { provider, runId, query, discoveryOptions } = opts;
    const providerId = provider.id;
    const startedAt = Date.now();

    this._emit({ type: "execution_started", runId, providerId, timestamp: Date.now() });

    let discovery: DiscoveryStats;
    try {
      const discoveryStart = Date.now();
      discovery = await this.createDiscoveryRunner(provider).run(query, discoveryOptions);
      this._emit({
        type: "discovery_completed",
        runId,
        providerId,
        durationMs: Date.now() - discoveryStart,
        discoveryStats: discovery,
        timestamp: Date.now(),
      });
    } catch (err) {
      this._emit({
        type: "execution_failed",
        runId,
        providerId,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
      throw err;
    }

    let normalization: RunStats;
    try {
      const normStart = Date.now();
      normalization = await this.coordinator.execute(runId);
      this._emit({
        type: "normalization_completed",
        runId,
        providerId,
        durationMs: Date.now() - normStart,
        normalizationStats: normalization,
        timestamp: Date.now(),
      });
    } catch (err) {
      this._emit({
        type: "execution_failed",
        runId,
        providerId,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
      throw err;
    }

    return { discovery, normalization };
  }

  // ---------------------------------------------------------------------------

  private _emit(event: Parameters<IExecutionReporter["report"]>[0]): void {
    try {
      this.reporter.report(event);
    } catch {
      // Reporter failures must never break execution
    }
  }
}