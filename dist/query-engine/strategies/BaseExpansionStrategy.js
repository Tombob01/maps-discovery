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
// ---------------------------------------------------------------------------
// BaseExpansionStrategy
// ---------------------------------------------------------------------------
export class BaseExpansionStrategy {
    // ---------------------------------------------------------------------------
    // Public IExpansionStrategy implementation
    // ---------------------------------------------------------------------------
    async apply(query, context) {
        try {
            const candidates = this._apply(query, context);
            const filtered = this._filterCandidates(candidates, context);
            return ok(filtered.map((c) => c.rawText));
        }
        catch (caught) {
            return err(this._wrapError("UNKNOWN", "Unexpected error in strategy", caught));
        }
    }
    /**
     * Identical to apply() but returns StrategyCandidate[] including metadata.
     * Used by QueryExpander when it needs to attach ExpansionMetadata to the
     * constructed GeneratedQuery objects.
     */
    applyWithMetadata(query, context) {
        try {
            const candidates = this._apply(query, context);
            const filtered = this._filterCandidates(candidates, context);
            return ok(filtered);
        }
        catch (caught) {
            return err(this._wrapError("UNKNOWN", "Unexpected error in strategy", caught));
        }
    }
    // ---------------------------------------------------------------------------
    // Shared helpers for subclasses
    // ---------------------------------------------------------------------------
    /**
     * Builds an ExpansionMetadata record for a candidate.
     * Subclasses call this inside _apply() for each candidate they produce.
     */
    _meta(options) {
        const meta = {
            strategyId: this.id,
        };
        if (options.sourceTerm !== undefined)
            meta.sourceTerm = options.sourceTerm;
        if (options.confidence !== undefined)
            meta.confidence = options.confidence;
        if (options.parentQueryHash !== undefined)
            meta.parentQueryHash = options.parentQueryHash;
        return Object.freeze(meta);
    }
    /**
     * Wraps a raw error into ExpansionStrategyErrorDetail.
     */
    _wrapError(code, message, cause) {
        const detail = {
            strategyId: this.id,
            code,
            message,
        };
        if (cause !== undefined)
            detail.cause = cause;
        return Object.freeze(detail);
    }
    // ---------------------------------------------------------------------------
    // Private — dedup + budget enforcement
    // ---------------------------------------------------------------------------
    _filterCandidates(candidates, context) {
        const existingLower = new Set(context.existingVariants.map((v) => v.trim().toLowerCase()));
        const accepted = [];
        for (const candidate of candidates) {
            if (accepted.length >= context.maxNew)
                break;
            const normalised = candidate.rawText.trim().toLowerCase();
            if (normalised === "")
                continue;
            if (existingLower.has(normalised))
                continue;
            existingLower.add(normalised);
            accepted.push(candidate);
        }
        return accepted;
    }
}
//# sourceMappingURL=BaseExpansionStrategy.js.map