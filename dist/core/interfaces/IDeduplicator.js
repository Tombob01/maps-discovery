/**
 * @module core/interfaces/IDeduplicator
 *
 * Deduplication contracts.
 *
 * Architecture:
 *   IDeduplicator               orchestrates strategies
 *   ├── IDeduplicationStrategy  single matching algorithm
 *   │   ├── ExactMatchStrategy  (placeId, normalizedPhone exact match)
 *   │   └── FuzzyMatchStrategy  (name + address Levenshtein)
 *   └── IFingerprintGenerator   produces the stable Fingerprint hash
 */
export {};
//# sourceMappingURL=IDeduplicator.js.map