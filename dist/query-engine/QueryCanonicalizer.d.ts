/**
 * @module query-engine/QueryCanonicalizer
 *
 * Implements IQueryCanonicalizer.
 *
 * Responsibilities:
 *   1. Text normalisation   — lowercase, whitespace collapse, punctuation strip,
 *                             optional modifier-token sort
 *   2. Geo label normalisation — lowercase, strip punctuation, trim
 *   3. Hash computation     — deterministic SHA-256 over identity parts
 *   4. Duplicate detection  — O(1) lookup against existingHashes map
 *   5. Batch dedup          — collapseByHash() for bulk query lists
 *
 * All operations are synchronous, pure, and deterministic.
 * No I/O, no external calls, no state mutation.
 */
import type { CanonicalizerConfig } from "./config/QueryEngineConfig.js";
import type { CanonicalizationError, IQueryCanonicalizer } from "../core/interfaces/IQueryEngine.js";
import type { CanonicalizedQuery, GeneratedQuery, QueryIdentityParts } from "../core/models/Query.js";
import type { QueryHash, QueryID, Result } from "../core/types/common.js";
export declare class QueryCanonicalizer implements IQueryCanonicalizer {
    private readonly config;
    private readonly stripPattern;
    constructor(config: CanonicalizerConfig);
    canonicalize(query: GeneratedQuery, existingHashes: ReadonlyMap<QueryHash, QueryID>): Result<CanonicalizedQuery, CanonicalizationError>;
    hashFromParts(parts: QueryIdentityParts): QueryHash;
    normalizeText(rawText: string): string;
    normalizeGeoLabel(geoTargetDisplayName: string): string;
    collapseByHash(queries: readonly GeneratedQuery[]): readonly GeneratedQuery[];
    /**
     * Sorts only the leading modifier token run in a query string.
     *
     * Algorithm:
     *   - Split into tokens by whitespace.
     *   - Identify the longest prefix of tokens that are all single words
     *     (no prepositions/conjunctions — "in", "near", "and", "or", "the").
     *   - Sort that prefix alphabetically.
     *   - Reassemble: sortedPrefix + remainingTokens.
     *
     * This means "emergency licensed plumbers in Lagos" and
     * "licensed emergency plumbers in Lagos" both become
     * "emergency licensed plumbers in Lagos".
     *
     * The anchor words ("in", "near", "of", "and", "or", "the", "for",
     * "with", "near", "by") mark the boundary between the modifier prefix
     * and the substantive query — sorting stops at the first anchor word.
     */
    private _sortModifierTokens;
}
//# sourceMappingURL=QueryCanonicalizer.d.ts.map