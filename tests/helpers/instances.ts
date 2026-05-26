/**
 * @module tests/helpers/instances
 *
 * Pre-wired component instances used across test suites.
 * These use the standard defaults so tests reflect real behaviour.
 */

import {
  makeNicheDictionary,
  makeNicheDictionaryIndex,
  makeGeoDictionary,
  makeGeoDictionaryIndex,
} from "./builders.js";
import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import {
  PassthroughGeoResolver,
  StaticCoordinateGeoResolver,
} from "../../src/query-engine/GeoResolver.js";
import { QueryBuilder } from "../../src/query-engine/QueryBuilder.js";
import { QueryCanonicalizer } from "../../src/query-engine/QueryCanonicalizer.js";
import { QueryExpander } from "../../src/query-engine/QueryExpander.js";
import { GeoExpansionStrategy } from "../../src/query-engine/strategies/GeoExpansionStrategy.js";
import { ModifierExpansionStrategy } from "../../src/query-engine/strategies/ModifierExpansionStrategy.js";
import { PluralExpansionStrategy } from "../../src/query-engine/strategies/PluralExpansionStrategy.js";
import { SynonymExpansionStrategy } from "../../src/query-engine/strategies/SynonymExpansionStrategy.js";

// ---------------------------------------------------------------------------
// Shared canonicalizer instances
// ---------------------------------------------------------------------------

/** Default canonicalizer: sort modifiers ON, standard punctuation strip. */
export function makeCanonicalizer(
  overrides: {
    sortModifierTokens?: boolean;
    stripPunctuationPattern?: string;
  } = {},
): QueryCanonicalizer {
  return new QueryCanonicalizer({
    sortModifierTokens: overrides.sortModifierTokens ?? true,
    stripPunctuationPattern:
      overrides.stripPunctuationPattern ??
      QUERY_ENGINE_DEFAULTS.canonicalizer.stripPunctuationPattern,
  });
}

/** Canonicalizer with modifier sorting disabled. */
export const canonicalizerNoSort = makeCanonicalizer({
  sortModifierTokens: false,
});

/** Standard canonicalizer (sorting on). */
export const canonicalizer = makeCanonicalizer();

// ---------------------------------------------------------------------------
// Shared dictionary indices
// ---------------------------------------------------------------------------

export const plumberDict = makeNicheDictionary();
export const electricianDict = makeNicheDictionary({
  niche: "electricians",
  terms: [
    {
      term: "electrician",
      synonyms: ["electrical contractor", "electrical engineer"],
      modifiers: ["certified", "industrial", "domestic"],
      plural: "electricians",
      singular: "electrician",
    },
  ],
});

export const niches = makeNicheDictionaryIndex([plumberDict, electricianDict]);
export const nigeGeo = makeGeoDictionaryIndex([makeGeoDictionary()]);
export const emptyGeo = makeGeoDictionaryIndex([]);

// ---------------------------------------------------------------------------
// Shared strategy instances
// ---------------------------------------------------------------------------

export const synonymStrategy = new SynonymExpansionStrategy(niches);
export const modifierStrategy = new ModifierExpansionStrategy(niches);
export const pluralStrategy = new PluralExpansionStrategy(niches);
export const geoStrategy = new GeoExpansionStrategy(nigeGeo);

// ---------------------------------------------------------------------------
// Shared expander instances
// ---------------------------------------------------------------------------

export function makeExpander(
  strategyIds: string[] = ["synonym", "modifier", "plural", "geo"],
): QueryExpander {
  return new QueryExpander(
    [synonymStrategy, modifierStrategy, pluralStrategy, geoStrategy],
    canonicalizer,
    {
      defaultMaxVariants: 20,
      defaultStrategyIds: strategyIds,
      continueOnStrategyError: true,
    },
  );
}

// ---------------------------------------------------------------------------
// Shared geo resolvers
// ---------------------------------------------------------------------------

export const passthroughGeoResolver = new PassthroughGeoResolver(
  QUERY_ENGINE_DEFAULTS.geoResolver,
);

export const staticGeoResolver = new StaticCoordinateGeoResolver(
  { "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 } },
  QUERY_ENGINE_DEFAULTS.geoResolver,
);

// ---------------------------------------------------------------------------
// Shared builder instance
// ---------------------------------------------------------------------------

export const queryBuilder = new QueryBuilder(canonicalizer);
