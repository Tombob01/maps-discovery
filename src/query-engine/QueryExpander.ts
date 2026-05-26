/**
 * @module query-engine/QueryExpander
 *
 * Implements IQueryExpander.
 *
 * Orchestrates one or more IExpansionStrategy instances against a root
 * GeneratedQuery to produce an ordered list of variant GeneratedQuery objects.
 *
 * Expansion loop:
 *   For each strategy (in registration order or seed-specified order):
 *     1. Call strategy.applyWithMetadata(query, context)
 *     2. For each surviving candidate:
 *        a. Normalise the rawText and compute its queryHash
 *        b. Check against existingQueryHashes — skip if already seen
 *        c. Construct a full GeneratedQuery with provenance fields
 *        d. Add to output + update context sets
 *     3. Stop when context.maxNew is exhausted
 *
 * The expander never calls providers, the DB, or queues.
 * It is entirely in-memory and deterministic given the same inputs.
 */

import { randomUUID } from "node:crypto";

import { BaseExpansionStrategy } from "./strategies/BaseExpansionStrategy.js";
import { ok, err } from "../core/types/common.js";

import type { ExpansionConfig } from "./config/QueryEngineConfig.js";
import type { StrategyCandidate } from "./strategies/BaseExpansionStrategy.js";
import type {
  IExpansionStrategy,
  IQueryCanonicalizer,
  IQueryExpander,
  QueryExpanderErrorDetail,
} from "../core/interfaces/IQueryEngine.js";
import type {
  ExpansionContext,
  ExpansionMetadata,
  GeneratedQuery,
} from "../core/models/Query.js";
import type {
  QueryHash,
  QueryID,
  Result,
  RunID,
} from "../core/types/common.js";

// ---------------------------------------------------------------------------
// QueryExpander
// ---------------------------------------------------------------------------

export class QueryExpander implements IQueryExpander {
  /** Registered strategies keyed by ID for O(1) lookup. */
  private readonly strategyMap: ReadonlyMap<string, IExpansionStrategy>;

  constructor(
    strategies: readonly IExpansionStrategy[],
    private readonly canonicalizer: IQueryCanonicalizer,
    private readonly config: ExpansionConfig,
  ) {
    const m = new Map<string, IExpansionStrategy>();
    for (const s of strategies) {
      m.set(s.id, s);
    }
    this.strategyMap = m;
  }

  // ---------------------------------------------------------------------------
  // IQueryExpander.expand()
  // ---------------------------------------------------------------------------

  async expand(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Promise<Result<readonly GeneratedQuery[], QueryExpanderErrorDetail>> {
    // Resolve strategy list: seed-specified or config default
    const strategyIds = this._resolveStrategyIds(context);
    const variants: GeneratedQuery[] = [];

    // Mutable sets tracking what has been accepted so far in this call.
    // These start from the caller-supplied context and grow as we accept candidates.
    const seenTexts = new Set<string>(
      context.existingVariants.map((v) => v.trim().toLowerCase()),
    );
    const seenHashes = new Set<QueryHash>(context.existingQueryHashes);

    let remaining = context.maxNew;

    for (const stratId of strategyIds) {
      if (remaining <= 0) break;

      const strategy = this.strategyMap.get(stratId);
      if (strategy === undefined) {
        // Unknown strategy ID — skip unless config says to abort
        if (!this.config.continueOnStrategyError) {
          return err({
            code: "STRATEGY_FAILED",
            message: `Strategy "${stratId}" is not registered`,
          });
        }
        continue;
      }

      // Build a context snapshot reflecting what has been accepted so far
      const snapshot = buildContext(context, seenTexts, seenHashes, remaining);

      // Use applyWithMetadata if available (BaseExpansionStrategy subclasses)
      // Fall back to apply() for external strategy plugins that only implement
      // the IExpansionStrategy interface.
      const candidatesResult = await this._callStrategy(
        strategy,
        query,
        snapshot,
      );

      if (!candidatesResult.ok) {
        if (!this.config.continueOnStrategyError) {
          return err({
            code: "STRATEGY_FAILED",
            message: candidatesResult.error.message,
            cause: candidatesResult.error,
          });
        }
        // Log and continue (in production, replace with injected logger)
        continue;
      }

      for (const candidate of candidatesResult.value) {
        if (remaining <= 0) break;

        const gq = this._buildVariant(candidate, query, context.runId);
        if (gq === null) continue;

        // Hash-level dedup (catches canonicalization-equivalent duplicates)
        if (seenHashes.has(gq.queryHash)) continue;

        seenTexts.add(gq.rawText.trim().toLowerCase());
        seenHashes.add(gq.queryHash);
        variants.push(gq);
        remaining--;
      }
    }

    return ok(variants);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the list of strategy IDs to apply to `query`.
   * Prefers the seed's expansionStrategyIds if present.
   */
  private _resolveStrategyIds(context: ExpansionContext): readonly string[] {
    return (context as any).strategyIds ?? this.config.defaultStrategyIds;
  }

  /**
   * Calls a strategy, using the richer applyWithMetadata() path if the
   * strategy is a BaseExpansionStrategy, or the standard apply() path
   * for external IExpansionStrategy implementations.
   */
  private async _callStrategy(
    strategy: IExpansionStrategy,
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Promise<Result<readonly StrategyCandidate[], { message: string }>> {
    if (strategy instanceof BaseExpansionStrategy) {
      const result = strategy.applyWithMetadata(query, context);
      if (!result.ok) return err({ message: result.error.message });
      return ok(result.value);
    }

    // External plugin: wrap plain strings with minimal metadata
    const result = await strategy.apply(query, context);
    if (!result.ok) return err({ message: result.error.message });

    const wrapped: StrategyCandidate[] = result.value.map((rawText) => ({
      rawText,
      metadata: Object.freeze({
        strategyId: strategy.id,
        parentQueryHash: query.queryHash,
      }) as ExpansionMetadata,
    }));

    return ok(wrapped);
  }

  /**
   * Constructs a full GeneratedQuery from a StrategyCandidate.
   * Returns null if the rawText normalises to empty.
   */
  private _buildVariant(
    candidate: StrategyCandidate,
    parentQuery: GeneratedQuery,
    runId: RunID,
  ): GeneratedQuery | null {
    const rawText = candidate.rawText.trim();
    if (rawText === "") return null;

    const canonicalText = this.canonicalizer.normalizeText(rawText);
    const canonicalGeoLabel = this.canonicalizer.normalizeGeoLabel(
      parentQuery.geoTarget.displayName,
    );
    const queryHash = this.canonicalizer.hashFromParts({
      canonicalText,
      canonicalGeoLabel,
      providerId: parentQuery.providerId,
    });

    const generatedByStrategies: readonly string[] = Object.freeze([
      ...parentQuery.generatedByStrategies,
      candidate.metadata.strategyId,
    ]);

    const expansionMetadata: readonly ExpansionMetadata[] = Object.freeze([
      ...(parentQuery.expansionMetadata ?? []),
      candidate.metadata,
    ]);

    return Object.freeze({
      id: randomUUID() as QueryID,
      runId,
      parentId: parentQuery.id,
      rawText,
      niche: parentQuery.niche,
      geoTarget: parentQuery.geoTarget,
      providerId: parentQuery.providerId,
      generatedByStrategies,
      queryHash,
      lifecycleState: "generated",
      status: "pending",
      createdAt: new Date(),
      expansionMetadata,
      // score: absent — left to future QueryRanker
    }) as GeneratedQuery;
  }
}

// ---------------------------------------------------------------------------
// Pure helper — build a context snapshot
// ---------------------------------------------------------------------------

function buildContext(
  base: ExpansionContext,
  seenTexts: ReadonlySet<string>,
  seenHashes: ReadonlySet<QueryHash>,
  remaining: number,
): ExpansionContext {
  return {
    runId: base.runId,
    existingVariants: Array.from(seenTexts),
    existingQueryHashes: seenHashes,
    maxNew: remaining,
    providerId: base.providerId,
  };
}
