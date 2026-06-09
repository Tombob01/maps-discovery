/**
 * @module query-engine/NominatimGeoResolver
 *
 * IGeoResolver implementation backed by the Nominatim geocoding API
 * (OpenStreetMap). Zero external dependencies -- uses the global fetch
 * available in Node >= 20.
 *
 * Resolution sequence:
 *   1. GeoTarget.coordinates present  -> return immediately (no API call)
 *   2. Cache hit on normalised key    -> return cached result
 *   3. Nominatim API call             -> cache + return on success
 *   4. Any failure (network, timeout, empty results, bad data)
 *                                     -> delegate to PassthroughGeoResolver
 *
 * No country scoping is applied by default. The resolver works globally.
 * Caller supplies User-Agent via NominatimConfig; Nominatim policy requires
 * a descriptive User-Agent identifying the application and contact info.
 *
 * Injectable fetch makes unit tests fully offline.
 */

import { ok } from "../core/types/common.js";
import { PassthroughGeoResolver } from "./GeoResolver.js";
import { InMemoryGeoCache } from "./IGeoCache.js";

import type { IGeoResolver, GeoResolutionErrorDetail } from "../core/interfaces/IQueryEngine.js";
import type { Result } from "../core/types/common.js";
import type { GeoTarget, ResolvedGeoTarget, GeoCoordinates } from "../core/types/geo.js";
import type { GeoResolverConfig } from "./config/QueryEngineConfig.js";
import type { IGeoCache } from "./IGeoCache.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NominatimConfig {
  /**
   * Nominatim endpoint. Defaults to the public OSM instance.
   * Override for self-hosted instances or testing.
   */
  readonly baseUrl?: string;

  /**
   * Required by Nominatim usage policy.
   * Must identify your application with a project URL or contact address.
   * e.g. "maps-discovery/1.0 (https://github.com/your-org/maps-discovery)"
   * Placeholder emails such as admin@example.com will receive HTTP 403.
   */
  readonly userAgent: string;

  /**
   * Request timeout in milliseconds. Defaults to 5000.
   */
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Nominatim response shape (only fields we use)
// ---------------------------------------------------------------------------

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// NominatimGeoResolver
// ---------------------------------------------------------------------------

export class NominatimGeoResolver implements IGeoResolver {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly cache: IGeoCache;
  private readonly fallback: PassthroughGeoResolver;
  private readonly fetchFn: typeof fetch;

  constructor(
    resolverConfig: GeoResolverConfig,
    nominatimConfig: NominatimConfig,
    options?: {
      cache?: IGeoCache;
      fetch?: typeof fetch;
    },
  ) {
    this.baseUrl = nominatimConfig.baseUrl ?? "https://nominatim.openstreetmap.org";
    this.userAgent = nominatimConfig.userAgent;
    this.timeoutMs = nominatimConfig.timeoutMs ?? 5_000;
    this.cache = options?.cache ?? new InMemoryGeoCache();
    this.fallback = new PassthroughGeoResolver(resolverConfig);
    this.fetchFn = options?.fetch ?? globalThis.fetch;
  }

  async resolve(
    target: GeoTarget,
  ): Promise<Result<ResolvedGeoTarget, GeoResolutionErrorDetail>> {
    // Priority 1: explicit coordinates -- return immediately.
    if (target.coordinates !== undefined) {
      return this.fallback.resolve(target);
    }

    const cacheKey = target.displayName.trim().toLowerCase();

    // Priority 2: cache hit.
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return ok(buildResolvedTarget(target, cached));
    }

    // Priority 3: Nominatim API call.
    const coords = await this.callNominatim(target.displayName);
    if (coords !== undefined) {
      this.cache.set(cacheKey, coords);
      return ok(buildResolvedTarget(target, coords));
    }

    // Priority 4: fallback to PassthroughGeoResolver (country centroids).
    return this.fallback.resolve(target);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async callNominatim(query: string): Promise<GeoCoordinates | undefined> {
    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en",
        },
        signal: controller.signal,
      });

      if (!response.ok) return undefined;

      const results = await response.json() as NominatimResult[];
      if (!Array.isArray(results) || results.length === 0) return undefined;

      const first = results[0];
      if (first === undefined) return undefined;

      const lat = parseFloat(first.lat);
      const lon = parseFloat(first.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;

      return { lat, lng: lon };
    } catch {
      // Network error, timeout, JSON parse error -- all become undefined.
      return undefined;
    } finally {
      clearTimeout(timerId);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

function buildResolvedTarget(
  target: GeoTarget,
  coordinates: GeoCoordinates,
): ResolvedGeoTarget {
  return Object.freeze({
    ...target,
    resolvedCoordinates: Object.freeze(coordinates),
  }) as ResolvedGeoTarget;
}
