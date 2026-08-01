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
import type { NormalizationJobPayload, ProposalProductionJobPayload } from "../core/models/Job.js";
import type { UUID } from "../core/types/common.js";
import type { IQueue } from "../queue/IQueue.js";
import type { IRawResultStore } from "../storage/IRawResultStore.js";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface DiscoveryStats {
  /** Total ProviderResults yielded by the provider. */
  readonly resultsCollected: number;
  /**
   * Total results that were genuinely new rows in the raw result store
   * (i.e. rawResultStore.save() returned true). Results that were
   * rediscovered within this same run (e.g. via an overlapping query)
   * are not counted here, since no new row was written for them.
   */
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
    private readonly proposalProductionQueue?: IQueue<ProposalProductionJobPayload>,
  ) {}

  /**
   * Runs discovery for a single resolved query.
   * Iterates the provider generator, persists each result, and enqueues
   * a normalization job. Returns stats - never throws on per-result errors.
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

      let wasNewInsert: boolean;
      let assignedRawResultId: UUID;
      try {
        const saveResult = await this.rawResultStore.saveAndGetId(result);
        wasNewInsert = saveResult.isNew;
        assignedRawResultId = saveResult.id;
      } catch (err) {
        console.error("[discovery:save-error] providerResultId=" + result.providerResultId + " runId=" + result.runId + " queryId=" + result.queryId + " error=" + (err instanceof Error ? err.message : String(err)) + " stack=" + (err instanceof Error ? err.stack : "n/a"));
        errors++;
        continue;
      }

      if (!wasNewInsert) {
        // Already collected earlier in this run (e.g. rediscovered via an
        // overlapping seed/query) -- the row already exists, so no new
        // normalization job is needed for it. Not an error.
        continue;
      }

      resultsSaved++;

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

      // Proposal-production enqueue: independent, best-effort, additive.
      // Never affects resultsSaved/jobsEnqueued/errors above -- must never
      // block or affect the legacy normalization pipeline (Working Rule
      // 2.16). Per Phase 4E-D-3 (Reading A, confirmed): failures here are
      // silently logged only, never surfaced in DiscoveryStats.
      if (this.proposalProductionQueue !== undefined) {
        try {
          const proposalPayload: ProposalProductionJobPayload = {
            runId: result.runId,
            queryId: result.queryId,
            rawResultId: assignedRawResultId,
            providerId: result.providerId,
          };
          const proposalEnqResult = await this.proposalProductionQueue.enqueue(proposalPayload);
          if (!proposalEnqResult.ok) {
            console.log('[discovery:proposal-enqueue-fail] reason=' + proposalEnqResult.error.code + ' rawResultId=' + proposalPayload.rawResultId);
          }
        } catch (err) {
          console.error('[discovery:proposal-enqueue-error] rawResultId=' + assignedRawResultId + ' error=' + (err instanceof Error ? err.message : String(err)));
        }
      }
    }

    const qDepth = await this.normalizationQueue.depth();
    const qDepthVal = qDepth.ok ? qDepth.value : '?';
    console.log('[discovery:done] resultsCollected=' + resultsCollected + ' resultsSaved=' + resultsSaved + ' jobsEnqueued=' + jobsEnqueued + ' errors=' + errors + ' queue-depth-after-enqueue=' + qDepthVal);
    return { resultsCollected, resultsSaved, jobsEnqueued, errors };
  }
}
