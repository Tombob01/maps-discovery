/**
 * @module core/models/BusinessRecord
 *
 * The canonical, normalised representation of a discovered business.
 *
 * Lifecycle:
 *   ProviderResult  →  (Normalizer)  →  BusinessRecord  →  (Deduplicator)
 *   →  unique BusinessRecord  →  (Exporter)  →  output
 *
 * Rules:
 *   • All string fields are trimmed and non-empty, or null.
 *   • `normalizedName` and `normalizedPhone` are set by the Normalizer.
 *   • `fingerprint` is computed by FingerprintGenerator — never set manually.
 *   • Status fields are only mutated by their respective pipeline stage.
 *   • No methods, no computed properties, no logic of any kind.
 */
export {};
//# sourceMappingURL=BusinessRecord.js.map