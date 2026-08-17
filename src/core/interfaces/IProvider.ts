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

import type { ProviderResult } from "../models/ProviderResult.js";
import type { ResolvedQuery } from "../models/Query.js";
import type { Result } from "../types/common.js";
import type { ResumeToken } from "../types/pagination.js";
import type { ScrapingPolicy } from "../types/rate-limit.js";
import type { PlaceIdWebsiteCache } from "../../cache/PlaceIdWebsiteCache.js";

// ---------------------------------------------------------------------------
// Provider capabilities declaration
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  /** Provider can filter results to a geo radius or bounding box. */
  readonly supportsGeoFilter: boolean;
  /** Provider exposes a total result count. */
  readonly supportsResultCount: boolean;
  /** Provider exposes structured hours data. */
  readonly supportsHours: boolean;
  /** Provider exposes a price level field. */
  readonly supportsPriceLevel: boolean;
  /** Provider exposes GPS coordinates per listing. */
  readonly supportsCoordinates: boolean;
  /**
   * Maximum results the provider can return for a single query.
   * null = unknown or unlimited.
   */
  readonly maxResultsPerQuery: number | null;
}

// ---------------------------------------------------------------------------
// Provider health / availability
// ---------------------------------------------------------------------------

export type ProviderHealth =
  | { readonly status: "healthy" }
  | { readonly status: "degraded"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

// ---------------------------------------------------------------------------
// Discovery options
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  /**
   * If provided, the provider resumes pagination from this token
   * instead of starting from page 1.
   */
  readonly resumeToken?: ResumeToken;
  /**
   * Stop after yielding this many results regardless of pagination.
   * Undefined = collect everything the provider returns.
   */
  readonly maxResults?: number;
  /**
   * Optional per-run cache tracking which Place IDs (or provider-
   * specific identity equivalents) have already been observed in this
   * run and whether a website was captured. Providers MAY consult this
   * to skip redundant detail-page scraping for already-complete
   * businesses. Providers that do not support this optimization
   * simply ignore the field. Must be constructed fresh per run by the
   * caller -- never shared across runs.
   */
  readonly placeIdWebsiteCache?: PlaceIdWebsiteCache;
}

// ---------------------------------------------------------------------------
// IProvider
// ---------------------------------------------------------------------------

export interface IProvider {
  /** Unique, stable identifier for this provider. e.g. "google-maps" */
  readonly id: string;

  /** Human-readable name for logs and UI. e.g. "Google Maps" */
  readonly displayName: string;

  /** Self-declared capabilities used by the pipeline coordinator. */
  readonly capabilities: ProviderCapabilities;

  /** The scraping policy this provider was initialised with. */
  readonly policy: ScrapingPolicy;

  /**
   * Checks whether the provider is currently functional.
   * Must not throw — errors are expressed as ProviderHealth values.
   */
  checkHealth(): Promise<ProviderHealth>;

  /**
   * Discovers businesses matching the query.
   *
   * This is an async generator:
   *   - Each `yield` produces one ProviderResult.
   *   - The generator handles pagination internally.
   *   - If options.resumeToken is set, pagination resumes from that point.
   *   - On unrecoverable error, the generator throws a ProviderError.
   *
   * The caller is responsible for:
   *   - Persisting each yielded result before requesting the next.
   *   - Persisting the resumeToken from each result for crash recovery.
   */
  discover(
    query: ResolvedQuery,
    options?: DiscoveryOptions,
  ): AsyncGenerator<ProviderResult, void, undefined>;

  /**
   * Graceful shutdown — release browser, connections, etc.
   * Must be idempotent (safe to call multiple times).
   */
  shutdown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// IBrowserProvider — extended contract for Playwright-based providers
// ---------------------------------------------------------------------------

/**
 * Adds browser lifecycle management to IProvider.
 * Implementations live in src/providers/*, never in src/core/*.
 */
export interface IBrowserProvider extends IProvider {
  /** True once initializeBrowser() has succeeded. */
  readonly browserReady: boolean;

  /**
   * Initialises the Playwright browser instance.
   * Must be called before discover().
   * Returns Err if the browser fails to launch.
   */
  initializeBrowser(): Promise<Result<void>>;

  /**
   * Closes the Playwright browser and all open pages.
   * Idempotent — safe to call if the browser was never started.
   */
  closeBrowser(): Promise<void>;
}

// ---------------------------------------------------------------------------
// IProviderRegistry — manages available provider instances
// ---------------------------------------------------------------------------

export interface IProviderRegistry {
  /**
   * Returns the provider registered under the given ID.
   * Returns null if no provider with that ID has been registered.
   */
  get(providerId: string): IProvider | null;

  /** Returns all registered providers. */
  getAll(): readonly IProvider[];

  /**
   * Registers a provider.
   * Throws if a provider with the same id is already registered.
   */
  register(provider: IProvider): void;

  /** Returns true if a provider with the given ID is registered. */
  has(providerId: string): boolean;
}
