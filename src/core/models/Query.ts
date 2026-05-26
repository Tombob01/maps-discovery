/**
 * @module core/models/Query
 *
 * Domain models for the query lifecycle:
 *
 *   QuerySeed  →  (QueryBuilder)      →  GeneratedQuery
 *              →  (QueryCanonicalizer) →  CanonicalizedQuery  (stable identity)
 *              →  (QueryExpander)      →  GeneratedQuery[]    (variants)
 *              →  (GeoResolver)        →  ResolvedQuery       (ready for provider)
 *
 * These are pure data shapes. No builder methods, no factory functions.
 */

import type {
  QueryHash,
  QueryID,
  QueryLifecycleState,
  QueryStatus,
  RunID,
} from "../types/common.js";
import type { GeoTarget, ResolvedGeoTarget } from "../types/geo.js";

// ---------------------------------------------------------------------------
// Query seed — the initial intent from the caller
// ---------------------------------------------------------------------------

/**
 * The root input that initiates a discovery run.
 * niche + location is the minimum viable seed.
 */
export interface QuerySeed {
  /** Human-readable business category. e.g. "plumbers", "digital agencies" */
  readonly niche: string;

  readonly location: GeoTarget;

  /**
   * Optional qualifiers appended to the query string.
   * e.g. ["emergency", "residential", "licensed"]
   */
  readonly modifiers?: readonly string[];

  /**
   * IDs of expansion strategies to apply.
   * If omitted, only the base query is generated.
   */
  readonly expansionStrategyIds?: readonly string[];

  /**
   * Maximum number of query variants to generate (base + expanded).
   * Expansion strategies are applied until this limit is reached.
   */
  readonly maxVariants?: number;

  /**
   * Maximum results to collect across all variants for this seed.
   * Providers stop enqueuing new pages once this is reached.
   * Undefined means no limit.
   */
  readonly maxResults?: number;
}

// ---------------------------------------------------------------------------
// ExpansionMetadata — provenance record for a single strategy contribution
// ---------------------------------------------------------------------------

/**
 * Records the contribution of one expansion strategy to a GeneratedQuery.
 *
 * Attached as an array on GeneratedQuery.expansionMetadata, with one entry
 * per strategy that shaped the query. Root (seed) queries carry no entries
 * (the array is absent or empty) — they have no expansion provenance.
 *
 * Design:
 *   - All fields beyond strategyId are optional so strategies that cannot
 *     or choose not to emit them don't need to provide defaults.
 *   - confidence is in [0.0, 1.0]; absent means the strategy does not
 *     model confidence (treat as 1.0, never as 0.0).
 *   - parentQueryHash links back to the exact query this variant was
 *     derived from, enabling reconstruction of the full derivation tree
 *     even after the parent QueryID is no longer in scope.
 */
export interface ExpansionMetadata {
  /**
   * Stable ID of the strategy that produced or contributed to this query.
   * e.g. "seed", "synonym-expansion", "modifier-expansion", "ai-llm"
   */
  readonly strategyId: string;

  /**
   * The term, keyword, or phrase from the strategy's vocabulary that
   * triggered this variant. Absent for strategies that do not operate
   * on discrete terms (e.g. modifier-reordering strategies).
   *
   * Examples:
   *   synonym-expansion:   "plumber" → sourceTerm: "plumber"
   *   modifier-expansion:  adds "emergency" → sourceTerm: "emergency"
   *   ai-llm:              produced "drainage specialist" from "plumber"
   *                        → sourceTerm: "plumber"
   */
  readonly sourceTerm?: string;

  /**
   * Strategy's self-reported confidence that this variant is a
   * semantically valid and useful alternative to the parent query.
   * Range: [0.0, 1.0].
   *
   * Absent when the strategy does not model confidence.
   * Consumers must treat absence as 1.0, never as 0.0.
   *
   * Used by future ranking systems (QueryRanker) to weight variants
   * when maxVariants forces truncation of the expansion set.
   */
  readonly confidence?: number;

  /**
   * QueryHash of the direct parent query from which this variant was
   * derived. Absent on root seed queries.
   *
   * Enables full derivation-tree reconstruction from a flat list of
   * GeneratedQuery objects without relying on parentId (which is
   * run-scoped and not stable across runs).
   *
   * Distinct from GeneratedQuery.parentId:
   *   parentId      — QueryID, run-scoped UUID, foreign key in DB
   *   parentQueryHash — QueryHash, content-addressed, cross-run stable
   */
  readonly parentQueryHash?: QueryHash;
}

// ---------------------------------------------------------------------------
// Generated query — a concrete search string, not yet provider-resolved
// ---------------------------------------------------------------------------

export interface GeneratedQuery {
  readonly id: QueryID;
  readonly runId: RunID;

  /**
   * null for root queries; set to parent's id for expanded variants.
   * Forms a tree: root → depth-1 expansions → depth-2 expansions …
   */
  readonly parentId: QueryID | null;

  /** The final string that will be sent to the provider. */
  readonly rawText: string;

  /** Original niche from the seed (preserved for analytics). */
  readonly niche: string;

  /** Location target as specified by the seed. */
  readonly geoTarget: GeoTarget;

  /**
   * Which provider this query is intended for.
   * Queries are provider-specific: the same niche may produce different
   * query strings for Google Maps vs Yelp.
   */
  readonly providerId: string;

  /**
   * Ordered list of strategy IDs that produced or shaped this query.
   *
   * Replaces the previous single `generatedBy: string` field.
   *
   * Semantics:
   *   - Root (seed) query:   ["seed"]
   *   - Single-strategy:     ["modifier-expansion"]
   *   - Chained strategies:  ["synonym-expansion", "modifier-expansion"]
   *     (first entry is earliest in the chain)
   *
   * An empty array is not valid — every query has at least one origin.
   * Enforced at construction time by QueryBuilder / QueryExpander.
   */
  readonly generatedByStrategies: readonly string[];

  /**
   * Deterministic, content-addressable hash of this query's canonical form.
   *
   * Computed by IQueryCanonicalizer from:
   *   canonical(rawText) + providerId + canonical(geoTarget display name)
   *
   * Uses:
   *   - BullMQ jobId for queue-level idempotency (prevents duplicate jobs
   *     even if the same query is enqueued multiple times across retries)
   *   - Cache key for skip-if-already-dispatched logic
   *   - Cross-run deduplication (same query text + provider = same hash)
   *   - DB unique constraint in the `queries` table (queryHash column)
   *
   * Set by QueryCanonicalizer immediately after construction.
   * Type: hex-encoded SHA-256 (64 characters).
   */
  readonly queryHash: QueryHash;

  /**
   * Optional relevance score in the range [0.0, 1.0].
   *
   * Used by future ranking systems to prioritise high-value queries
   * (e.g. dispatch higher-scoring queries first, truncate low-scoring
   * queries when maxVariants is reached).
   *
   * Absent on root seed queries (assumed score = 1.0 by convention).
   * Set by expansion strategies or a future QueryRanker component.
   *
   * Consumers must treat absence as equivalent to 1.0, not 0.0.
   */
  readonly score?: number;

  /**
   * Expansion provenance — one entry per strategy that contributed to
   * this query's construction.
   *
   * Empty / absent for root seed queries.
   * Single entry for direct single-strategy expansions.
   * Multiple entries for chained strategies, in application order
   * (earliest strategy first), mirroring generatedByStrategies.
   *
   * The array length must equal generatedByStrategies.length for
   * non-seed queries. Enforced at construction time by QueryExpander.
   *
   * Stored as JSONB in the `queries.expansion_metadata` column.
   */
  readonly expansionMetadata?: readonly ExpansionMetadata[];

  /**
   * Fine-grained in-process lifecycle state.
   *
   * Orthogonal to `status` (the coarse DB/queue field):
   *   status          — persisted, updated by workers after queue round-trips
   *   lifecycleState  — updated in-process by the query-engine and coordinator
   *
   * Initialised to "generated" by QueryBuilder.
   * Transitions forward through the pipeline; never moves backward.
   * See QueryLifecycleState for the full transition diagram.
   */
  readonly lifecycleState: QueryLifecycleState;

  readonly status: QueryStatus;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Canonicalized query — GeneratedQuery after normalization pass
// ---------------------------------------------------------------------------

/**
 * The output of IQueryCanonicalizer applied to a GeneratedQuery.
 *
 * Adds the stable canonical form alongside the original raw text.
 * The canonical form is what queryHash is derived from.
 *
 * Separation rationale:
 *   - rawText is preserved verbatim for audit, debugging, and re-runs.
 *   - canonicalText is used for identity, caching, and dedup only.
 *   - They differ when rawText has inconsistent casing, redundant spaces,
 *     or token ordering that the canonicalizer has normalised away.
 */
export interface CanonicalizedQuery extends GeneratedQuery {
  /**
   * Normalized form of rawText after canonicalization:
   *   - Lowercased
   *   - Whitespace collapsed and trimmed
   *   - Tokens sorted where order is semantically insignificant
   *     (e.g. modifier-only segments, not full query strings)
   *   - Punctuation stripped except where meaningful (e.g. hyphens in brands)
   *
   * This field is the authoritative input for queryHash computation.
   * It is never sent to providers — rawText is always used for discovery.
   */
  readonly canonicalText: string;

  /**
   * Canonical form of the geo target's display name, used as part of
   * the hash input. e.g. "lagos nigeria" (lowercased, trimmed).
   */
  readonly canonicalGeoLabel: string;

  /**
   * True if this query was identified as a duplicate of an existing one
   * during the canonicalization pass (same queryHash already in run).
   * Duplicate queries are not dispatched.
   */
  readonly isDuplicateOfExisting: boolean;

  /**
   * If isDuplicateOfExisting is true, the ID of the query whose
   * queryHash matches this one.
   */
  readonly duplicateOfQueryId?: QueryID;
}

// ---------------------------------------------------------------------------
// QueryIdentityParts — the three inputs that together define a query's hash
// ---------------------------------------------------------------------------

/**
 * The minimal, normalised inputs required to compute a QueryHash.
 *
 * All three fields are in canonical form (lowercased, trimmed, normalised)
 * before being passed to IQueryCanonicalizer.hashFromParts().
 *
 * Rationale for a named interface over loose arguments:
 *   1. Call-site clarity — prevents argument transposition bugs
 *      (canonicalText vs canonicalGeoLabel are both plain strings)
 *   2. Cacheability — the struct can be used as a cache key by the
 *      ExpansionContext builder without recomputing individual strings
 *   3. Extensibility — adding a fourth identity dimension (e.g. locale)
 *      only requires updating this interface and the hash implementation,
 *      not every call site
 *   4. Testability — test fixtures can construct QueryIdentityParts
 *      directly without building a full GeneratedQuery
 */
export interface QueryIdentityParts {
  /**
   * Canonical (normalised) form of the query text.
   * e.g. "emergency plumbers lagos" (lowercase, collapsed whitespace)
   *
   * Produced by IQueryCanonicalizer.normalizeText(rawText).
   * This is the primary differentiator between query variants.
   */
  readonly canonicalText: string;

  /**
   * Canonical form of the geo target's display name.
   * e.g. "lagos nigeria" (lowercase, stripped punctuation, trimmed)
   *
   * Produced by IQueryCanonicalizer.normalizeGeoLabel(displayName).
   * Ensures the same query text aimed at different locations produces
   * distinct hashes.
   */
  readonly canonicalGeoLabel: string;

  /**
   * The provider this query is intended for.
   * e.g. "google-maps", "yelp"
   *
   * Ensures the same query text + location produces distinct hashes
   * for different providers (provider-specific query syntax may differ).
   */
  readonly providerId: string;
}

// ---------------------------------------------------------------------------
// Resolved query — a GeneratedQuery with confirmed coordinates
// ---------------------------------------------------------------------------

/**
 * A GeneratedQuery after GeoResolver has confirmed the lat/lng.
 * This is the type consumed by providers — they receive nothing less.
 */
export interface ResolvedQuery extends GeneratedQuery {
  readonly resolvedGeoTarget: ResolvedGeoTarget;
}

// ---------------------------------------------------------------------------
// Expansion context — passed to IQueryExpander strategies
// ---------------------------------------------------------------------------

export interface ExpansionContext {
  readonly runId: RunID;

  /**
   * Raw text of queries already generated in this run.
   * Strategies use this to avoid producing duplicate text variants.
   */
  readonly existingVariants: readonly string[];

  /**
   * QueryHash values of queries already generated in this run.
   *
   * Used by the expander and canonicalizer together to perform fast
   * O(1) duplicate detection without string normalization at call time.
   * A strategy-produced string whose canonical hash is already in this
   * set must be discarded, even if its rawText differs from all entries
   * in existingVariants (catches canonicalization-equivalent duplicates).
   */
  readonly existingQueryHashes: ReadonlySet<QueryHash>;

  /**
   * Maximum number of NEW variants this context may produce.
   * Strategies must not exceed this.
   */
  readonly maxNew: number;

  /**
   * The target provider ID.
   * Strategies may use this to tailor wording (e.g. hashtag syntax for
   * a platform that supports it).
   */
  readonly providerId: string;
}

// ---------------------------------------------------------------------------
// Run config — top-level configuration for an entire pipeline run
// ---------------------------------------------------------------------------

export interface RunConfig {
  readonly runId: RunID;
  readonly seeds: readonly QuerySeed[];
  readonly providerIds: readonly string[];

  /** If true, re-process queries that previously completed successfully. */
  readonly forceReprocess: boolean;

  /**
   * ISO 8601 datetime string. If set, only re-run queries whose
   * collected_at timestamp is before this value.
   */
  readonly reprocessBefore?: string;
}
