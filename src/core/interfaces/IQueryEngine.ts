/**
 * @module core/interfaces/IQueryEngine
 *
 * Query intelligence contracts.
 *
 * Separation guarantees:
 *   • IQueryEngine knows nothing about providers (no Playwright, no HTTP).
 *   • IQueryExpander knows nothing about the DB or queues.
 *   • IExpansionStrategy is the unit of extensibility — add a new one
 *     without touching any existing code.
 *
 * Extension points (future):
 *   AIExpansionStrategy    — calls an LLM to generate semantic variants
 *   AutocompleteStrategy   — harvests provider autocomplete suggestions
 *   TrendingStrategy       — uses search-trend data
 */

import type {
  GeneratedQuery,
  CanonicalizedQuery,
  QueryIdentityParts,
  QuerySeed,
  ResolvedQuery,
  ExpansionContext,
} from "../models/Query.js";
import type { Result, QueryHash, QueryID } from "../types/common.js";
import type { ResolvedGeoTarget } from "../types/geo.js";

// ---------------------------------------------------------------------------
// IQueryEngine — converts a QuerySeed into GeneratedQuery[]
// ---------------------------------------------------------------------------

export interface IQueryEngine {
  /**
   * Generates one or more queries from a seed.
   *
   * Returns at least one query (the verbatim seed query).
   * May return more if expansion strategies are configured and produce variants.
   *
   * Returns Err if the seed is malformed or geo resolution fails.
   */
  generate(
    seed: QuerySeed,
  ): Promise<Result<readonly GeneratedQuery[], QueryEngineErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IQueryExpander — takes an existing query, produces variants
// ---------------------------------------------------------------------------

export interface IQueryExpander {
  /**
   * Expands a single query into zero or more additional query variants.
   * Never returns the input query itself.
   * Respects context.maxNew — may return fewer than maxNew.
   */
  expand(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Promise<Result<readonly GeneratedQuery[], QueryExpanderErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IExpansionStrategy — single unit of variant generation
// ---------------------------------------------------------------------------

/**
 * Stateless, composable building block for the query expander.
 * Each strategy produces a list of raw query strings (not full GeneratedQuery
 * objects — those are assembled by the expander using these strings).
 */
export interface IExpansionStrategy {
  /** Stable ID, e.g. "synonym", "modifier", "ai-llm", "autocomplete" */
  readonly id: string;

  /** Human-readable description for logging. */
  readonly description: string;

  /**
   * Produces variant query strings for the given input.
   *
   * Must:
   *   - Return only strings not already in context.existingVariants.
   *   - Return at most context.maxNew strings.
   *   - Not throw — errors are expressed as Err results.
   *
   * May return an empty array if no useful variants can be produced.
   */
  apply(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): Promise<Result<readonly string[], ExpansionStrategyErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IGeoResolver — converts a GeoTarget to a ResolvedGeoTarget
// ---------------------------------------------------------------------------

export interface IGeoResolver {
  /**
   * Resolves a loose GeoTarget to confirmed coordinates.
   *
   * If the GeoTarget already has coordinates, implementations may return
   * them directly without any external call.
   *
   * Returns Err if the location cannot be resolved.
   */
  resolve(
    target: import("../types/geo.js").GeoTarget,
  ): Promise<Result<ResolvedGeoTarget, GeoResolutionErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IResolvedQueryFactory — assembles a ResolvedQuery from its parts
// ---------------------------------------------------------------------------

/**
 * Converts a GeneratedQuery + ResolvedGeoTarget into a ResolvedQuery.
 * Exists as an interface so implementations can be swapped/mocked.
 */
export interface IResolvedQueryFactory {
  create(query: GeneratedQuery, resolvedGeo: ResolvedGeoTarget): ResolvedQuery;
}

// ---------------------------------------------------------------------------
// IQueryCanonicalizer — stable identity and duplicate detection
// ---------------------------------------------------------------------------

/**
 * Transforms a GeneratedQuery into a CanonicalizedQuery by:
 *   1. Normalising rawText → canonicalText
 *   2. Computing queryHash from canonicalText + providerId + canonicalGeoLabel
 *   3. Checking existingHashes to flag duplicates
 *
 * Canonical normalization rules (all stateless, deterministic):
 *   • Lowercase the entire string
 *   • Collapse all whitespace runs to a single space
 *   • Trim leading and trailing whitespace
 *   • Strip punctuation that carries no search meaning (commas, periods,
 *     extra hyphens) while preserving meaningful punctuation (apostrophes
 *     in brand names, single hyphens between compound words)
 *   • Sort modifier-only token groups where order is not meaningful
 *     (e.g. "licensed emergency plumbers" ≡ "emergency licensed plumbers")
 *     — sorting applies only within parenthetical modifier segments,
 *     never to the full query string
 *
 * Implementations live in src/query-engine/. This interface is the contract.
 */
export interface IQueryCanonicalizer {
  /**
   * Canonicalizes a single query.
   *
   * `existingHashes` is the set of QueryHash values already generated
   * in the current run. If the computed hash is found in this set,
   * the returned CanonicalizedQuery will have isDuplicateOfExisting=true
   * and duplicateOfQueryId set.
   *
   * Must not throw. Returns Err only on hash computation failure
   * (e.g. crypto API unavailable), not on duplicate detection.
   */
  canonicalize(
    query: GeneratedQuery,
    existingHashes: ReadonlyMap<QueryHash, QueryID>,
  ): Result<CanonicalizedQuery, CanonicalizationError>;

  /**
   * Derives a QueryHash from pre-computed canonical identity parts,
   * without requiring a full GeneratedQuery.
   *
   * Accepts a QueryIdentityParts struct rather than three loose string
   * arguments to prevent transposition errors (canonicalText and
   * canonicalGeoLabel are both plain strings with no type distinction)
   * and to allow call sites to cache the parts object.
   *
   * Used by the ExpansionContext builder to pre-screen strategy-produced
   * strings before constructing GeneratedQuery objects for them.
   */
  hashFromParts(parts: QueryIdentityParts): QueryHash;

  /**
   * Applies text normalization rules to a raw query string and returns
   * the canonical form. Does not compute a hash.
   *
   * Exposed so the ExpansionContext builder and dedup strategies can
   * normalise strings without constructing full query objects.
   */
  normalizeText(rawText: string): string;

  /**
   * Normalises a geo target's display name for use in hash computation.
   * e.g. "Lagos, Nigeria " → "lagos nigeria"
   */
  normalizeGeoLabel(geoTargetDisplayName: string): string;

  /**
   * Collapses a list of GeneratedQuery objects by removing any whose
   * queryHash is already present in an earlier entry in the list.
   *
   * Preserves the original ordering of the first occurrence of each hash.
   * Used at the query:generate stage to deduplicate before bulk-insert.
   */
  collapseByHash(queries: readonly GeneratedQuery[]): readonly GeneratedQuery[];
}

// ---------------------------------------------------------------------------
// Canonicalization error types
// ---------------------------------------------------------------------------

export type CanonicalizationErrorCode =
  | "HASH_COMPUTATION_FAILED"
  | "EMPTY_CANONICAL_TEXT"
  | "INVALID_QUERY";

export interface CanonicalizationError {
  readonly code: CanonicalizationErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Error types for query intelligence — code aliases live in errors/
// ---------------------------------------------------------------------------

// Re-export ErrorCode aliases from their canonical location in errors/
export type { QueryEngineErrorCode } from "../errors/PipelineError.js";
export type { GeoResolutionErrorCode } from "../errors/PipelineError.js";
import type {
  QueryEngineErrorCode,
  GeoResolutionErrorCode,
} from "../errors/PipelineError.js";

export type QueryExpanderErrorCode =
  | "STRATEGY_FAILED"
  | "ALL_STRATEGIES_FAILED"
  | "MAX_VARIANTS_REACHED";

export type ExpansionStrategyErrorCode =
  | "EXTERNAL_CALL_FAILED"
  | "RATE_LIMITED"
  | "PARSE_FAILED"
  | "UNKNOWN";

export interface QueryEngineErrorDetail {
  readonly code: QueryEngineErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface QueryExpanderErrorDetail {
  readonly code: QueryExpanderErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface ExpansionStrategyErrorDetail {
  readonly strategyId: string;
  readonly code: ExpansionStrategyErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface GeoResolutionErrorDetail {
  readonly code: GeoResolutionErrorCode;
  readonly message: string;
  readonly input: import("../types/geo.js").GeoTarget;
  readonly cause?: unknown;
}
