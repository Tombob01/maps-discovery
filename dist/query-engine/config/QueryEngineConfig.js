/**
 * @module query-engine/config/QueryEngineConfig
 *
 * Typed configuration shapes for the entire query-engine package.
 *
 * All configuration is plain data — no logic, no defaults here.
 * Defaults live in QueryEngineConfig.defaults (the const object below).
 * Consumers merge their overrides with those defaults at startup.
 */
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export const QUERY_ENGINE_DEFAULTS = {
    canonicalizer: {
        sortModifierTokens: true,
        stripPunctuationPattern: ",\\.;!?",
    },
    expansion: {
        defaultMaxVariants: 20,
        defaultStrategyIds: ["synonym", "modifier", "plural", "geo"],
        continueOnStrategyError: true,
    },
    geoResolver: {
        validateExistingCoordinates: true,
    },
};
//# sourceMappingURL=QueryEngineConfig.js.map