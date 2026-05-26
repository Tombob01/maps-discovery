/**
 * @module query-engine/QueryEngineFactory
 *
 * Wires all query-engine components into a ready-to-use QueryEngine.
 *
 * This is the single assembly point for the package. Callers outside
 * query-engine should only need to call createQueryEngine() — they never
 * instantiate individual components directly.
 *
 * All components are assembled synchronously. Dictionary loading
 * (which reads from disk) is the only I/O at construction time.
 */
import { QUERY_ENGINE_DEFAULTS } from "./config/QueryEngineConfig.js";
import { loadAllDictionaries } from "./dictionaries/DictionaryLoader.js";
import { PassthroughGeoResolver, StaticCoordinateGeoResolver, } from "./GeoResolver.js";
import { QueryCanonicalizer } from "./QueryCanonicalizer.js";
import { QueryEngine } from "./QueryEngine.js";
import { QueryExpander } from "./QueryExpander.js";
import { SynonymExpansionStrategy, ModifierExpansionStrategy, PluralExpansionStrategy, GeoExpansionStrategy, } from "./strategies/index.js";
// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------
/**
 * Assembles a fully wired QueryEngine from the provided options.
 *
 * Throws on dictionary load failure (malformed YAML) — treat as
 * an unrecoverable startup error.
 */
export function createQueryEngine(options) {
    const { config } = options;
    // ── Load dictionaries ──────────────────────────────────────────────────
    const { niches, geo } = loadAllDictionaries(config.dictionaries.nicheDictionariesDir, config.dictionaries.geoDictionariesDir);
    // ── Canonicalizer ──────────────────────────────────────────────────────
    const canonicalizer = new QueryCanonicalizer(config.canonicalizer);
    // ── Geo resolver ───────────────────────────────────────────────────────
    const geoResolver = options.staticCoordinates !== undefined &&
        Object.keys(options.staticCoordinates).length > 0
        ? new StaticCoordinateGeoResolver(options.staticCoordinates, config.geoResolver)
        : new PassthroughGeoResolver(config.geoResolver);
    // ── Built-in strategies ────────────────────────────────────────────────
    const builtInStrategies = [
        new SynonymExpansionStrategy(niches),
        new ModifierExpansionStrategy(niches),
        new PluralExpansionStrategy(niches),
        new GeoExpansionStrategy(geo),
    ];
    // ── Additional (plugin) strategies ────────────────────────────────────
    const allStrategies = [
        ...builtInStrategies,
        ...(options.additionalStrategies ?? []),
    ];
    // ── Expander ───────────────────────────────────────────────────────────
    const expander = new QueryExpander(allStrategies, canonicalizer, config.expansion);
    // ── Engine ─────────────────────────────────────────────────────────────
    const engine = new QueryEngine(canonicalizer, expander, geoResolver, config, niches);
    return {
        engine,
        canonicalizer,
        nicheDictCount: niches.size,
        geoDictCount: geo.size,
        strategyIds: Object.freeze(allStrategies.map((s) => s.id)),
    };
}
// ---------------------------------------------------------------------------
// Convenience: build config with defaults
// ---------------------------------------------------------------------------
/**
 * Merges caller-supplied partial config with QUERY_ENGINE_DEFAULTS.
 * `dictionaries` is required (paths cannot have defaults).
 */
export function buildQueryEngineConfig(dictionaries, overrides) {
    return {
        dictionaries,
        canonicalizer: {
            ...QUERY_ENGINE_DEFAULTS.canonicalizer,
            ...overrides?.canonicalizer,
        },
        expansion: {
            ...QUERY_ENGINE_DEFAULTS.expansion,
            ...overrides?.expansion,
        },
        geoResolver: {
            ...QUERY_ENGINE_DEFAULTS.geoResolver,
            ...overrides?.geoResolver,
        },
    };
}
//# sourceMappingURL=QueryEngineFactory.js.map