/**
 * @module query-engine/dictionaries/NicheDictionary
 *
 * Schema types for niche dictionary YAML files and their validated
 * in-memory representation.
 *
 * YAML file shape (niche-plumbers.yml):
 * ─────────────────────────────────────
 * version: 1
 * niche: plumbers
 * terms:
 *   - term: plumber
 *     synonyms:
 *       - plumbing contractor
 *       - pipefitter
 *       - drainage specialist
 *     modifiers:
 *       - emergency
 *       - residential
 *       - commercial
 *       - licensed
 *     plural: plumbers
 *     singular: plumber
 *   - term: plumbing services
 *     synonyms:
 *       - plumbing company
 *       - plumbing firm
 *     modifiers:
 *       - local
 *       - affordable
 */
/**
 * Raw shape parsed from YAML. All fields are `unknown` until validation.
 * The loader validates this into NicheDictionary before returning it.
 */
export interface RawNicheDictionaryFile {
    readonly version?: unknown;
    readonly niche?: unknown;
    readonly terms?: unknown;
}
export interface RawNicheTerm {
    readonly term?: unknown;
    readonly synonyms?: unknown;
    readonly modifiers?: unknown;
    readonly plural?: unknown;
    readonly singular?: unknown;
}
export interface NicheTerm {
    /** The canonical form of this term. e.g. "plumber" */
    readonly term: string;
    /**
     * Semantically equivalent phrases that can substitute for `term`
     * as the primary subject of a query.
     * e.g. ["plumbing contractor", "pipefitter", "drainage specialist"]
     */
    readonly synonyms: readonly string[];
    /**
     * Qualifiers that can be prepended to create more specific variants.
     * e.g. ["emergency", "residential", "licensed"]
     *
     * ModifierExpansionStrategy generates one variant per modifier
     * (applied to the base query), not all combinations.
     */
    readonly modifiers: readonly string[];
    /**
     * Plural form of the term for PluralExpansionStrategy.
     * e.g. "plumbers" (from term "plumber")
     * Absent if the term has no meaningful plural.
     */
    readonly plural?: string;
    /**
     * Singular form of the term for PluralExpansionStrategy.
     * e.g. "plumber" (from term "plumbers")
     * Absent if the term has no meaningful singular.
     */
    readonly singular?: string;
}
export interface NicheDictionary {
    /** Schema version — currently always 1. */
    readonly version: 1;
    /**
     * The niche identifier this dictionary covers.
     * Matches the niche field on QuerySeed.
     * e.g. "plumbers", "digital-agencies", "electricians"
     */
    readonly niche: string;
    /** All terms defined for this niche. */
    readonly terms: readonly NicheTerm[];
}
/**
 * Fast-lookup index over all loaded NicheDictionary instances.
 * Built once at startup by DictionaryLoader, then treated as immutable.
 */
export interface NicheDictionaryIndex {
    /**
     * Returns the NicheDictionary for a given niche string, or undefined
     * if no dictionary covers that niche.
     *
     * Lookup is case-insensitive and normalised (trimmed, lowercased).
     */
    get(niche: string): NicheDictionary | undefined;
    /** Returns all loaded niches. */
    allNiches(): readonly string[];
    /** Number of dictionaries loaded. */
    readonly size: number;
}
//# sourceMappingURL=NicheDictionary.d.ts.map