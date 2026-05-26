/**
 * @module core/interfaces/IProvider
 *
 * Provider abstraction — the contract every discovery provider must satisfy.
 *
 * Providers are pure I/O adapters. They:
 *   ✓ Accept a ResolvedQuery
 *   ✓ Yield ProviderResults via an async generator
 *   ✓ Expose their capabilities and configuration
 *
 * Providers must NOT:
 *   ✗ Contain niche-specific logic
 *   ✗ Call normalizers or exporters
 *   ✗ Write to the database directly
 *   ✗ Enqueue jobs
 */
export {};
//# sourceMappingURL=IProvider.js.map