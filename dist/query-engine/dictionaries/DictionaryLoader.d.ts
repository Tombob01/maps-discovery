/**
 * @module query-engine/dictionaries/DictionaryLoader
 *
 * Loads and validates YAML dictionary files from disk.
 * Returns fully typed, immutable index objects.
 *
 * Dependencies: `js-yaml` (pure JS, no external API calls).
 * No database, no network, no side effects beyond reading files.
 */
import type { GeoDictionaryIndex } from "./GeoDictionary.js";
import type { NicheDictionaryIndex } from "./NicheDictionary.js";
/**
 * Loads all *.yml / *.yaml files from `dir`, validates each as a
 * NicheDictionary, and returns a fast-lookup NicheDictionaryIndex.
 *
 * Throws on the first validation error — callers should treat a
 * corrupt dictionary as a startup failure.
 */
export declare function loadNicheDictionaries(dir: string): NicheDictionaryIndex;
/**
 * Loads all *.yml / *.yaml files from `dir`, validates each as a
 * GeoDictionary, and returns a fast-lookup GeoDictionaryIndex.
 */
export declare function loadGeoDictionaries(dir: string): GeoDictionaryIndex;
/**
 * Convenience: loads both dictionary types from their respective
 * directories and returns both indexes.
 */
export declare function loadAllDictionaries(nicheDictionariesDir: string, geoDictionariesDir: string): {
    niches: NicheDictionaryIndex;
    geo: GeoDictionaryIndex;
};
//# sourceMappingURL=DictionaryLoader.d.ts.map