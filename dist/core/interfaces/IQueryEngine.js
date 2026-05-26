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
export {};
//# sourceMappingURL=IQueryEngine.js.map