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
import { createHash } from "node:crypto";
import { ok, err } from "../core/types/common.js";
// ---------------------------------------------------------------------------
// QueryCanonicalizer
// ---------------------------------------------------------------------------
export class QueryCanonicalizer {
    config;
    stripPattern;
    constructor(config) {
        this.config = config;
        // Build the strip regex once from config, guarded against bad patterns
        try {
            this.stripPattern = new RegExp(`[${config.stripPunctuationPattern}]`, "g");
        }
        catch {
            // Fallback to safe default if the configured pattern is invalid
            this.stripPattern = /[,\.;!?]/g;
        }
    }
    // ---------------------------------------------------------------------------
    // IQueryCanonicalizer — canonicalize()
    // ---------------------------------------------------------------------------
    canonicalize(query, existingHashes) {
        const canonicalText = this.normalizeText(query.rawText);
        const canonicalGeoLabel = this.normalizeGeoLabel(query.geoTarget.displayName);
        if (canonicalText === "") {
            return err({
                code: "EMPTY_CANONICAL_TEXT",
                message: `Query rawText "${query.rawText}" normalised to empty string`,
            });
        }
        let queryHash;
        try {
            queryHash = this.hashFromParts({
                canonicalText,
                canonicalGeoLabel,
                providerId: query.providerId,
            });
        }
        catch (caught) {
            return err({
                code: "HASH_COMPUTATION_FAILED",
                message: "SHA-256 computation failed",
                cause: caught,
            });
        }
        const existingId = existingHashes.get(queryHash);
        const isDuplicate = existingId !== undefined;
        // Build CanonicalizedQuery — spread GeneratedQuery, override lifecycleState,
        // attach canonical fields. Use exactOptionalPropertyTypes-safe assignment.
        const base = {
            ...query,
            queryHash,
            lifecycleState: "canonicalized",
            canonicalText,
            canonicalGeoLabel,
            isDuplicateOfExisting: isDuplicate,
        };
        if (isDuplicate && existingId !== undefined) {
            return ok(Object.freeze({
                ...base,
                duplicateOfQueryId: existingId,
            }));
        }
        return ok(Object.freeze(base));
    }
    // ---------------------------------------------------------------------------
    // IQueryCanonicalizer — hashFromParts()
    // ---------------------------------------------------------------------------
    hashFromParts(parts) {
        // Deterministic concatenation with a separator that cannot appear
        // in any of the individual parts after normalisation.
        const input = `${parts.canonicalText}\x00${parts.providerId}\x00${parts.canonicalGeoLabel}`;
        return createHash("sha256")
            .update(input, "utf8")
            .digest("hex");
    }
    // ---------------------------------------------------------------------------
    // IQueryCanonicalizer — normalizeText()
    // ---------------------------------------------------------------------------
    normalizeText(rawText) {
        let text = rawText;
        // 1. Lowercase
        text = text.toLowerCase();
        // 2. Strip configured punctuation
        text = text.replace(this.stripPattern, " ");
        // 3. Collapse all whitespace runs to single space and trim
        text = text.replace(/\s+/g, " ").trim();
        // 4. Optionally sort modifier tokens
        if (this.config.sortModifierTokens) {
            text = this._sortModifierTokens(text);
        }
        return text;
    }
    // ---------------------------------------------------------------------------
    // IQueryCanonicalizer — normalizeGeoLabel()
    // ---------------------------------------------------------------------------
    normalizeGeoLabel(geoTargetDisplayName) {
        return geoTargetDisplayName
            .toLowerCase()
            .replace(/[,\.;]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    // ---------------------------------------------------------------------------
    // IQueryCanonicalizer — collapseByHash()
    // ---------------------------------------------------------------------------
    collapseByHash(queries) {
        const seen = new Set();
        const result = [];
        for (const q of queries) {
            if (seen.has(q.queryHash))
                continue;
            seen.add(q.queryHash);
            result.push(q);
        }
        return result;
    }
    // ---------------------------------------------------------------------------
    // Private — modifier token sorting
    // ---------------------------------------------------------------------------
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
    _sortModifierTokens(text) {
        const ANCHOR_WORDS = new Set([
            "in",
            "near",
            "and",
            "or",
            "the",
            "of",
            "for",
            "with",
            "by",
            "at",
            "on",
            "a",
            "an",
        ]);
        const tokens = text.split(" ");
        if (tokens.length < 2)
            return text;
        // Find the boundary: index of the first anchor word
        let boundary = 0;
        while (boundary < tokens.length &&
            !ANCHOR_WORDS.has(tokens[boundary] ?? "")) {
            boundary++;
        }
        // Nothing to sort if there are 0 or 1 prefix tokens,
        // or if no anchor word was found (entire string is the prefix)
        if (boundary < 2 || boundary === tokens.length)
            return text;
        const prefix = tokens.slice(0, boundary).sort();
        const remainder = tokens.slice(boundary);
        return [...prefix, ...remainder].join(" ");
    }
}
//# sourceMappingURL=QueryCanonicalizer.js.map