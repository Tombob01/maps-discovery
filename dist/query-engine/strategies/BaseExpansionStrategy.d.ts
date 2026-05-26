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
import type { IExpansionStrategy, ExpansionStrategyErrorDetail, ExpansionStrategyErrorCode } from "../../core/interfaces/IQueryEngine.js";
import type { GeneratedQuery, ExpansionContext, ExpansionMetadata } from "../../core/models/Query.js";
import type { Result } from "../../core/types/common.js";
/**
 * A string candidate produced by a strategy, together with the metadata
 * that should be attached if the candidate survives dedup.
 */
export interface StrategyCandidate {
    readonly rawText: string;
    readonly metadata: ExpansionMetadata;
}
export declare abstract class BaseExpansionStrategy implements IExpansionStrategy {
    abstract readonly id: string;
    abstract readonly description: string;
    apply(query: GeneratedQuery, context: ExpansionContext): Promise<Result<readonly string[], ExpansionStrategyErrorDetail>>;
    /**
     * Identical to apply() but returns StrategyCandidate[] including metadata.
     * Used by QueryExpander when it needs to attach ExpansionMetadata to the
     * constructed GeneratedQuery objects.
     */
    applyWithMetadata(query: GeneratedQuery, context: ExpansionContext): Result<readonly StrategyCandidate[], ExpansionStrategyErrorDetail>;
    /**
     * Produce raw StrategyCandidate objects.
     * No dedup or budget enforcement required here — the base class handles that.
     * May return more candidates than context.maxNew; extras are discarded.
     * Must not throw — thrown errors are caught and wrapped in apply().
     */
    protected abstract _apply(query: GeneratedQuery, context: ExpansionContext): readonly StrategyCandidate[];
    /**
     * Builds an ExpansionMetadata record for a candidate.
     * Subclasses call this inside _apply() for each candidate they produce.
     */
    protected _meta(options: {
        sourceTerm?: string;
        confidence?: number;
        parentQueryHash?: import("../../core/types/common.js").QueryHash;
    }): ExpansionMetadata;
    /**
     * Wraps a raw error into ExpansionStrategyErrorDetail.
     */
    protected _wrapError(code: ExpansionStrategyErrorCode, message: string, cause?: unknown): ExpansionStrategyErrorDetail;
    private _filterCandidates;
}
//# sourceMappingURL=BaseExpansionStrategy.d.ts.map