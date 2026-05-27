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
 */

import type { IProvider, DiscoveryOptions } from "../core/interfaces/IProvider.js";
import type { ResolvedQuery } from "../core/models/Query.js";
import type { RunID } from "../core/types/common.js";
import type { RunStats } from "../core/models/Job.js";
import type { DiscoveryRunner, DiscoveryStats } from "./DiscoveryRunner.js";
import type { RunCoordinator } from "../pipeline/RunCoordinator.js";

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
  constructor(
    private readonly createDiscoveryRunner: (provider: IProvider) => DiscoveryRunner,
    private readonly coordinator: RunCoordinator,
  ) {}

  /**
   * Executes discovery then normalization for a single run.
   * Always invokes coordinator regardless of discovery result count.
   * Propagates coordinator exceptions without catching.
   */
  async execute(opts: ExecuteOptions): Promise<ExecutionSummary> {
    const { provider, runId, query, discoveryOptions } = opts;

    const discovery = await this.createDiscoveryRunner(provider).run(
      query,
      discoveryOptions,
    );

    const normalization = await this.coordinator.execute(runId);

    return { discovery, normalization };
  }
}