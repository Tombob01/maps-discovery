/**
 * @module runtime/DiscoveryRunner
 *
 * Drives a single provider's discover() generator for one query:
 *   - Iterates all yielded ProviderResults
 *   - Saves each to rawResultStore
 *   - Enqueues a NormalizationJobPayload per result
 *   - Returns DiscoveryStats describing what was collected
 *
 * DiscoveryRunner has NO lifecycle responsibilities:
 *   - Does not call RunLifecycleService
 *   - Does not mutate run status or persisted stats
 *   - Does not own error recovery
 *
 * Callers are responsible for sequencing with RunCoordinator.execute().
 */

import type { IProvider, DiscoveryOptions } from "../core/interfaces/IProvider.js";
import type { ResolvedQuery } from "../core/models/Query.js";
import type { NormalizationJobPayload } from "../core/models/Job.js";
import type { IQueue } from "../queue/IQueue.js";
import type { IRawResultStore } from "../storage/IRawResultStore.js";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface DiscoveryStats {
  /** Total ProviderResults yielded by the provider. */
  readonly resultsCollected: number;
  /** Total results successfully saved to the raw result store. */
  readonly resultsSaved: number;
  /** Total normalization jobs successfully enqueued. */
  readonly jobsEnqueued: number;
  /** Number of results that failed to save or enqueue (non-fatal). */
  readonly errors: number;
}

// ---------------------------------------------------------------------------
// DiscoveryRunner
// ---------------------------------------------------------------------------

export class DiscoveryRunner {
  constructor(
    private readonly provider: IProvider,
    private readonly rawResultStore: IRawResultStore,
    private readonly normalizationQueue: IQueue<NormalizationJobPayload>,
  ) {}

  /**
   * Runs discovery for a single resolved query.
   * Iterates the provider generator, persists each result, and enqueues
   * a normalization job. Returns stats � never throws on per-result errors.
   */
  async run(
    query: ResolvedQuery,
    options?: DiscoveryOptions,
  ): Promise<DiscoveryStats> {
    let resultsCollected = 0;
    let resultsSaved = 0;
    let jobsEnqueued = 0;
    let errors = 0;

    const generator = this.provider.discover(query, options);

    for await (const result of generator) {
      resultsCollected++;

      try {
        await this.rawResultStore.save(result);
        resultsSaved++;
      } catch (err) {
        console.error("[discovery:save-error] providerResultId=" + result.providerResultId + " runId=" + result.runId + " queryId=" + result.queryId + " error=" + (err instanceof Error ? err.message : String(err)) + " stack=" + (err instanceof Error ? err.stack : "n/a"));
        errors++;
        continue;
      }

      try {
        const payload: NormalizationJobPayload = {
          runId: result.runId,
          queryId: result.queryId,
          rawResultId: result.providerResultId,
          providerId: result.providerId,
        };
        const enqResult = await this.normalizationQueue.enqueue(payload);
        if (enqResult.ok) { jobsEnqueued++; } else { console.log('[discovery:enqueue-fail] reason=' + enqResult.error.code + ' rawResultId=' + payload.rawResultId); errors++; }
      } catch {
        errors++;
      }
    }

    const qDepth = await this.normalizationQueue.depth();
    const qDepthVal = qDepth.ok ? qDepth.value : '?';
    console.log('[discovery:done] resultsCollected=' + resultsCollected + ' resultsSaved=' + resultsSaved + ' jobsEnqueued=' + jobsEnqueued + ' errors=' + errors + ' queue-depth-after-enqueue=' + qDepthVal);
    return { resultsCollected, resultsSaved, jobsEnqueued, errors };
  }
}

