/**
 * @module query-engine/strategies/BaseExpansionStrategy
 *
 * Abstract base class for all expansion strategies.
 *
 * Provides:
 *   - Shared budget enforcement (context.maxNew)
 *   - Duplicate screening against existingVariants and existingQueryHashes
 *   - Provenance helpers for building ExpansionMetadata
 *   - Consistent Err wrapping
 *
 * Subclasses implement only `_apply()` — the raw string generation step.
 * All dedup, budget, and metadata concerns are handled here.
 */

import { ok, err } from "../../core/types/common.js";

import type {
  IExpansionStrategy,
  ExpansionStrategyErrorDetail,
  ExpansionStrategyErrorCode,
} from "../../core/interfaces/IQueryEngine.js";
import type {
  GeneratedQuery,
  ExpansionContext,
  ExpansionMetadata,
} from "../../core/models/Query.js";
import type { Result } from "../../core/types/common.js";

// ---------------------------------------------------------------------------
// StrategyCandidate — internal intermediate before dedup
// ---------------------------------------------------------------------------

/**
 * A string candidate produced by a strategy, together with the metadata
 * that should be attached if the candidate survives dedup.
 */
export interface StrategyCandidate {
  readonly rawText: string;
  readonly metadata: ExpansionMetadata;
}

// ---------------------------------------------------------------------------
// BaseExpansionStrategy
// ---------------------------------------------------------------------------

export abstract class BaseExpansionStrategy implements IExpansionStrategy {
  abstract readonly id: string;
  abstract readonly description: string;

  // ---------------------------------------------------------------------------
  // Public IExpansionStrategy implementation
  // ---------------------------------------------------------------------------

  async apply(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Promise<Result<readonly string[], ExpansionStrategyErrorDetail>> {
    try {
      const candidates = this._apply(query, context);
      const filtered = this._filterCandidates(candidates, context);
      return ok(filtered.map((c) => c.rawText));
    } catch (caught) {
      return err(
        this._wrapError("UNKNOWN", "Unexpected error in strategy", caught),
      );
    }
  }

  /**
   * Identical to apply() but returns StrategyCandidate[] including metadata.
   * Used by QueryExpander when it needs to attach ExpansionMetadata to the
   * constructed GeneratedQuery objects.
   */
  applyWithMetadata(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Result<readonly StrategyCandidate[], ExpansionStrategyErrorDetail> {
    try {
      const candidates = this._apply(query, context);
      const filtered = this._filterCandidates(candidates, context);
      return ok(filtered);
    } catch (caught) {
      return err(
        this._wrapError("UNKNOWN", "Unexpected error in strategy", caught),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Abstract — subclasses implement this
  // ---------------------------------------------------------------------------

  /**
   * Produce raw StrategyCandidate objects.
   * No dedup or budget enforcement required here — the base class handles that.
   * May return more candidates than context.maxNew; extras are discarded.
   * Must not throw — thrown errors are caught and wrapped in apply().
   */
  protected abstract _apply(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): readonly StrategyCandidate[];

  // ---------------------------------------------------------------------------
  // Shared helpers for subclasses
  // ---------------------------------------------------------------------------

  /**
   * Builds an ExpansionMetadata record for a candidate.
   * Subclasses call this inside _apply() for each candidate they produce.
   */
  protected _meta(options: {
    sourceTerm?: string;
    confidence?: number;
    parentQueryHash?: import("../../core/types/common.js").QueryHash;
  }): ExpansionMetadata {
    const meta: {
      -readonly [K in keyof ExpansionMetadata]: ExpansionMetadata[K];
    } = {
      strategyId: this.id,
    };
    if (options.sourceTerm !== undefined) meta.sourceTerm = options.sourceTerm;
    if (options.confidence !== undefined) meta.confidence = options.confidence;
    if (options.parentQueryHash !== undefined)
      meta.parentQueryHash = options.parentQueryHash;
    return Object.freeze(meta) as ExpansionMetadata;
  }

  /**
   * Wraps a raw error into ExpansionStrategyErrorDetail.
   */
  protected _wrapError(
    code: ExpansionStrategyErrorCode,
    message: string,
    cause?: unknown,
  ): ExpansionStrategyErrorDetail {
    const detail: {
      -readonly [K in keyof ExpansionStrategyErrorDetail]: ExpansionStrategyErrorDetail[K];
    } = {
      strategyId: this.id,
      code,
      message,
    };
    if (cause !== undefined) detail.cause = cause;
    return Object.freeze(detail) as ExpansionStrategyErrorDetail;
  }

  // ---------------------------------------------------------------------------
  // Private — dedup + budget enforcement
  // ---------------------------------------------------------------------------

  private _filterCandidates(
    candidates: readonly StrategyCandidate[],
    context: ExpansionContext,
  ): readonly StrategyCandidate[] {
    const existingLower = new Set(
      context.existingVariants.map((v) => v.trim().toLowerCase()),
    );
    const accepted: StrategyCandidate[] = [];

    for (const candidate of candidates) {
      if (accepted.length >= context.maxNew) break;

      const normalised = candidate.rawText.trim().toLowerCase();
      if (normalised === "") continue;
      if (existingLower.has(normalised)) continue;

      existingLower.add(normalised);
      accepted.push(candidate);
    }

    return accepted;
  }
}
