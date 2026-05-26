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

import type { CanonicalizerConfig } from "./config/QueryEngineConfig.js";
import type {
  CanonicalizationError,
  IQueryCanonicalizer,
} from "../core/interfaces/IQueryEngine.js";
import type {
  CanonicalizedQuery,
  GeneratedQuery,
  QueryIdentityParts,
} from "../core/models/Query.js";
import type { QueryHash, QueryID, Result } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// QueryCanonicalizer
// ---------------------------------------------------------------------------

export class QueryCanonicalizer implements IQueryCanonicalizer {
  private readonly stripPattern: RegExp;

  constructor(private readonly config: CanonicalizerConfig) {
    // Build the strip regex once from config, guarded against bad patterns
    try {
      this.stripPattern = new RegExp(
        `[${config.stripPunctuationPattern}]`,
        "g",
      );
    } catch {
      // Fallback to safe default if the configured pattern is invalid
      this.stripPattern = /[,\.;!?]/g;
    }
  }

  // ---------------------------------------------------------------------------
  // IQueryCanonicalizer — canonicalize()
  // ---------------------------------------------------------------------------

  canonicalize(
    query: GeneratedQuery,
    existingHashes: ReadonlyMap<QueryHash, QueryID>,
  ): Result<CanonicalizedQuery, CanonicalizationError> {
    const canonicalText = this.normalizeText(query.rawText);
    const canonicalGeoLabel = this.normalizeGeoLabel(
      query.geoTarget.displayName,
    );

    if (canonicalText === "") {
      return err({
        code: "EMPTY_CANONICAL_TEXT",
        message: `Query rawText "${query.rawText}" normalised to empty string`,
      });
    }

    let queryHash: QueryHash;
    try {
      queryHash = this.hashFromParts({
        canonicalText,
        canonicalGeoLabel,
        providerId: query.providerId,
      });
    } catch (caught) {
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
    const base: Omit<CanonicalizedQuery, "duplicateOfQueryId"> = {
      ...query,
      queryHash,
      lifecycleState: "canonicalized",
      canonicalText,
      canonicalGeoLabel,
      isDuplicateOfExisting: isDuplicate,
    };

    if (isDuplicate && existingId !== undefined) {
      return ok(
        Object.freeze({
          ...base,
          duplicateOfQueryId: existingId,
        }) as CanonicalizedQuery,
      );
    }

    return ok(Object.freeze(base) as CanonicalizedQuery);
  }

  // ---------------------------------------------------------------------------
  // IQueryCanonicalizer — hashFromParts()
  // ---------------------------------------------------------------------------

  hashFromParts(parts: QueryIdentityParts): QueryHash {
    // Deterministic concatenation with a separator that cannot appear
    // in any of the individual parts after normalisation.
    const input = `${parts.canonicalText}\x00${parts.providerId}\x00${parts.canonicalGeoLabel}`;
    return createHash("sha256")
      .update(input, "utf8")
      .digest("hex") as QueryHash;
  }

  // ---------------------------------------------------------------------------
  // IQueryCanonicalizer — normalizeText()
  // ---------------------------------------------------------------------------

  normalizeText(rawText: string): string {
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

  normalizeGeoLabel(geoTargetDisplayName: string): string {
    return geoTargetDisplayName
      .toLowerCase()
      .replace(/[,\.;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------------------------------------------------------------------------
  // IQueryCanonicalizer — collapseByHash()
  // ---------------------------------------------------------------------------

  collapseByHash(
    queries: readonly GeneratedQuery[],
  ): readonly GeneratedQuery[] {
    const seen = new Set<QueryHash>();
    const result: GeneratedQuery[] = [];

    for (const q of queries) {
      if (seen.has(q.queryHash)) continue;
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
  private _sortModifierTokens(text: string): string {
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
    if (tokens.length < 2) return text;

    // Find the boundary: index of the first anchor word
    let boundary = 0;
    while (
      boundary < tokens.length &&
      !ANCHOR_WORDS.has(tokens[boundary] ?? "")
    ) {
      boundary++;
    }

    // Nothing to sort if there are 0 or 1 prefix tokens,
    // or if no anchor word was found (entire string is the prefix)
    if (boundary < 2 || boundary === tokens.length) return text;

    const prefix = tokens.slice(0, boundary).sort();
    const remainder = tokens.slice(boundary);

    return [...prefix, ...remainder].join(" ");
  }
}
