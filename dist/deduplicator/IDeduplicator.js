/**
 * @module deduplicator/IDeduplicator
 *
 * Deduplication contract.
 *
 * The deduplicator compares an incoming BusinessRecord against previously
 * seen records and classifies it as unique, duplicate, or uncertain.
 *
 * Stateless from the caller's perspective — state lives inside the
 * implementation (e.g. an in-memory fingerprint store, or a DB query).
 */
export {};
//# sourceMappingURL=IDeduplicator.js.map