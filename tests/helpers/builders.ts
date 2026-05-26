/**
 * @module tests/helpers/builders
 *
 * Reusable factories for constructing test domain objects.
 *
 * Rules:
 *   - Every builder has sane defaults so callers only specify what matters.
 *   - All IDs are deterministic strings (not random UUIDs) for snapshot stability.
 *   - Dates are frozen at a fixed epoch so snapshots never drift.
 *   - No I/O, no filesystem, no randomness.
 */

import type {
  QuerySeed,
  GeneratedQuery,
  CanonicalizedQuery,
  ExpansionContext,
  ExpansionMetadata,
  QueryIdentityParts,
} from "../../src/core/models/Query.js";
import type {
  QueryID,
  RunID,
  QueryHash,
  QueryLifecycleState,
} from "../../src/core/types/common.js";
import type { GeoTarget } from "../../src/core/types/geo.js";
import type {
  GeoDictionary,
  GeoRegion,
  GeoSubLocation,
  GeoDictionaryIndex,
} from "../../src/query-engine/dictionaries/GeoDictionary.js";
import type {
  NicheDictionary,
  NicheTerm,
  NicheDictionaryIndex,
} from "../../src/query-engine/dictionaries/NicheDictionary.js";

// ---------------------------------------------------------------------------
// Frozen test epoch — all test dates use this for snapshot determinism
// ---------------------------------------------------------------------------

export const TEST_EPOCH = new Date("2024-01-15T10:00:00.000Z");

// ---------------------------------------------------------------------------
// ID factories — deterministic, human-readable
// ---------------------------------------------------------------------------

export const makeRunId = (n = 1): RunID => `run-${n}` as RunID;
export const makeQueryId = (n = 1): QueryID => `query-${n}` as QueryID;
export const makeHash = (s: string): QueryHash =>
  s.padEnd(64, "0") as QueryHash;

// ---------------------------------------------------------------------------
// GeoTarget builder
// ---------------------------------------------------------------------------

export interface GeoTargetOverrides {
  displayName?: string;
  country?: string;
  state?: string;
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

export function makeGeoTarget(overrides: GeoTargetOverrides = {}): GeoTarget {
  const geo: {
    displayName: string;
    country: string;
    state?: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
    radiusKm?: number;
  } = {
    displayName: overrides.displayName ?? "Lagos, Nigeria",
    country: overrides.country ?? "NG",
  };
  if (overrides.state !== undefined) geo.state = overrides.state;
  if (overrides.city !== undefined) geo.city = overrides.city;
  if (overrides.lat !== undefined && overrides.lng !== undefined) {
    geo.coordinates = { lat: overrides.lat, lng: overrides.lng };
  }
  return geo as GeoTarget;
}

export const LAGOS_GEO = makeGeoTarget({
  displayName: "Lagos, Nigeria",
  country: "NG",
  city: "Lagos",
});
export const ABUJA_GEO = makeGeoTarget({
  displayName: "Abuja, Nigeria",
  country: "NG",
  city: "Abuja",
});
export const LONDON_GEO = makeGeoTarget({
  displayName: "London, UK",
  country: "GB",
  city: "London",
});
export const UNKNOWN_GEO = makeGeoTarget({
  displayName: "Atlantis",
  country: "XX",
});

// ---------------------------------------------------------------------------
// QuerySeed builder
// ---------------------------------------------------------------------------

export interface SeedOverrides {
  niche?: string;
  location?: GeoTarget;
  modifiers?: string[];
  expansionStrategyIds?: string[];
  maxVariants?: number;
  maxResults?: number;
}

export function makeSeed(overrides: SeedOverrides = {}): QuerySeed {
  return {
    niche: overrides.niche ?? "plumbers",
    location: overrides.location ?? LAGOS_GEO,
    ...(overrides.modifiers !== undefined && {
      modifiers: overrides.modifiers,
    }),
    ...(overrides.expansionStrategyIds !== undefined && {
      expansionStrategyIds: overrides.expansionStrategyIds,
    }),
    ...(overrides.maxVariants !== undefined && {
      maxVariants: overrides.maxVariants,
    }),
    ...(overrides.maxResults !== undefined && {
      maxResults: overrides.maxResults,
    }),
  };
}

// ---------------------------------------------------------------------------
// GeneratedQuery builder
// ---------------------------------------------------------------------------

export interface GeneratedQueryOverrides {
  id?: QueryID;
  runId?: RunID;
  parentId?: QueryID | null;
  rawText?: string;
  niche?: string;
  geoTarget?: GeoTarget;
  providerId?: string;
  generatedByStrategies?: readonly string[];
  queryHash?: QueryHash;
  lifecycleState?: QueryLifecycleState;
  score?: number;
  expansionMetadata?: readonly ExpansionMetadata[];
}

export function makeQuery(
  overrides: GeneratedQueryOverrides = {},
): GeneratedQuery {
  const rawText = overrides.rawText ?? "plumbers Lagos, Nigeria";
  return Object.freeze({
    id: overrides.id ?? makeQueryId(1),
    runId: overrides.runId ?? makeRunId(1),
    parentId: overrides.parentId ?? null,
    rawText,
    niche: overrides.niche ?? "plumbers",
    geoTarget: overrides.geoTarget ?? LAGOS_GEO,
    providerId: overrides.providerId ?? "google-maps",
    generatedByStrategies:
      overrides.generatedByStrategies ?? Object.freeze(["seed"]),
    queryHash:
      overrides.queryHash ??
      makeHash(rawText.toLowerCase().replace(/\s+/g, "-")),
    lifecycleState: overrides.lifecycleState ?? "generated",
    status: "pending",
    createdAt: TEST_EPOCH,
    ...(overrides.score !== undefined && { score: overrides.score }),
    ...(overrides.expansionMetadata !== undefined && {
      expansionMetadata: overrides.expansionMetadata,
    }),
  }) as GeneratedQuery;
}

// ---------------------------------------------------------------------------
// CanonicalizedQuery builder
// ---------------------------------------------------------------------------

export function makeCanonicalizedQuery(
  base: GeneratedQuery,
  overrides: {
    canonicalText?: string;
    canonicalGeoLabel?: string;
    isDuplicateOfExisting?: boolean;
    duplicateOfQueryId?: QueryID;
  } = {},
): CanonicalizedQuery {
  return Object.freeze({
    ...base,
    lifecycleState: "canonicalized" as QueryLifecycleState,
    canonicalText: overrides.canonicalText ?? base.rawText.toLowerCase().trim(),
    canonicalGeoLabel: overrides.canonicalGeoLabel ?? "lagos nigeria",
    isDuplicateOfExisting: overrides.isDuplicateOfExisting ?? false,
    ...(overrides.duplicateOfQueryId !== undefined && {
      duplicateOfQueryId: overrides.duplicateOfQueryId,
    }),
  }) as CanonicalizedQuery;
}

// ---------------------------------------------------------------------------
// ExpansionMetadata builder
// ---------------------------------------------------------------------------

export function makeExpansionMetadata(
  strategyId: string,
  overrides: {
    sourceTerm?: string;
    confidence?: number;
    parentQueryHash?: QueryHash;
  } = {},
): ExpansionMetadata {
  return Object.freeze({
    strategyId,
    ...(overrides.sourceTerm !== undefined && {
      sourceTerm: overrides.sourceTerm,
    }),
    ...(overrides.confidence !== undefined && {
      confidence: overrides.confidence,
    }),
    ...(overrides.parentQueryHash !== undefined && {
      parentQueryHash: overrides.parentQueryHash,
    }),
  });
}

// ---------------------------------------------------------------------------
// ExpansionContext builder
// ---------------------------------------------------------------------------

export function makeExpansionContext(
  overrides: {
    runId?: RunID;
    existingVariants?: string[];
    existingQueryHashes?: ReadonlySet<QueryHash>;
    maxNew?: number;
    providerId?: string;
  } = {},
): ExpansionContext {
  return {
    runId: overrides.runId ?? makeRunId(1),
    existingVariants: overrides.existingVariants ?? [],
    existingQueryHashes: overrides.existingQueryHashes ?? new Set(),
    maxNew: overrides.maxNew ?? 10,
    providerId: overrides.providerId ?? "google-maps",
  };
}

// ---------------------------------------------------------------------------
// QueryIdentityParts builder
// ---------------------------------------------------------------------------

export function makeIdentityParts(
  overrides: Partial<QueryIdentityParts> = {},
): QueryIdentityParts {
  return {
    canonicalText: overrides.canonicalText ?? "plumbers lagos nigeria",
    canonicalGeoLabel: overrides.canonicalGeoLabel ?? "lagos nigeria",
    providerId: overrides.providerId ?? "google-maps",
  };
}

// ---------------------------------------------------------------------------
// NicheDictionary builders (in-memory, no filesystem)
// ---------------------------------------------------------------------------

export function makeNicheTerm(overrides: Partial<NicheTerm> = {}): NicheTerm {
  return Object.freeze({
    term: overrides.term ?? "plumber",
    synonyms: Object.freeze(
      overrides.synonyms ?? ["plumbing contractor", "pipefitter"],
    ),
    modifiers: Object.freeze(
      overrides.modifiers ?? ["emergency", "residential"],
    ),
    ...(overrides.plural !== undefined && { plural: overrides.plural }),
    ...(overrides.singular !== undefined && { singular: overrides.singular }),
  });
}

export function makeNicheDictionary(
  overrides: {
    niche?: string;
    terms?: NicheTerm[];
  } = {},
): NicheDictionary {
  return Object.freeze({
    version: 1 as const,
    niche: overrides.niche ?? "plumbers",
    terms: Object.freeze(
      overrides.terms ?? [
        makeNicheTerm({
          term: "plumber",
          synonyms: [
            "plumbing contractor",
            "pipefitter",
            "drainage specialist",
          ],
          modifiers: ["emergency", "residential", "commercial", "licensed"],
          plural: "plumbers",
          singular: "plumber",
        }),
        makeNicheTerm({
          term: "plumbing services",
          synonyms: ["plumbing company", "plumbing firm"],
          modifiers: ["local", "affordable"],
        }),
      ],
    ),
  });
}

/** Builds a simple in-memory NicheDictionaryIndex for unit tests. */
export function makeNicheDictionaryIndex(
  dicts: NicheDictionary[],
): NicheDictionaryIndex {
  const map = new Map<string, NicheDictionary>();
  for (const d of dicts) map.set(d.niche.toLowerCase(), d);

  return {
    get: (niche: string) => map.get(niche.trim().toLowerCase()),
    allNiches: () => Array.from(map.keys()),
    size: map.size,
  };
}

// ---------------------------------------------------------------------------
// GeoDictionary builders (in-memory)
// ---------------------------------------------------------------------------

export function makeGeoSubLocation(
  name: string,
  aliases: string[] = [],
): GeoSubLocation {
  return Object.freeze({
    name,
    type: "district" as const,
    aliases: Object.freeze(aliases),
  });
}

export function makeGeoRegion(
  overrides: {
    name?: string;
    subLocations?: GeoSubLocation[];
    aliases?: string[];
  } = {},
): GeoRegion {
  return Object.freeze({
    name: overrides.name ?? "Lagos",
    type: "state" as const,
    aliases: Object.freeze(overrides.aliases ?? ["Lagos State"]),
    subLocations: Object.freeze(
      overrides.subLocations ?? [
        makeGeoSubLocation("Victoria Island", ["VI"]),
        makeGeoSubLocation("Lekki", ["Lekki Peninsula"]),
        makeGeoSubLocation("Ikeja"),
        makeGeoSubLocation("Surulere"),
      ],
    ),
  });
}

export function makeGeoDictionary(
  overrides: {
    country?: string;
    countryCode?: string;
    regions?: GeoRegion[];
  } = {},
): GeoDictionary {
  return Object.freeze({
    version: 1 as const,
    country: overrides.country ?? "Nigeria",
    countryCode: overrides.countryCode ?? "NG",
    regions: Object.freeze(overrides.regions ?? [makeGeoRegion()]),
  });
}

/** Builds a simple in-memory GeoDictionaryIndex for unit tests. */
export function makeGeoDictionaryIndex(
  dicts: GeoDictionary[],
): GeoDictionaryIndex {
  const byCode = new Map<string, GeoDictionary>();
  const byName = new Map<string, GeoDictionary>();
  for (const d of dicts) {
    byCode.set(d.countryCode.toUpperCase(), d);
    byName.set(d.country.toLowerCase(), d);
  }

  return {
    getByCountryCode: (code: string) => byCode.get(code.trim().toUpperCase()),
    getByCountryName: (name: string) => byName.get(name.trim().toLowerCase()),
    getSubLocations: (regionName: string) => {
      const normalised = regionName.trim().toLowerCase();
      const results: GeoSubLocation[] = [];
      for (const dict of byCode.values()) {
        for (const region of dict.regions) {
          if (region.name.toLowerCase() === normalised) {
            results.push(...region.subLocations);
          }
        }
      }
      return results;
    },
    size: byCode.size,
  };
}
