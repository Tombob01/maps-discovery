/**
 * @module query-engine/dictionaries/DictionaryLoader
 *
 * Loads and validates YAML dictionary files from disk.
 * Returns fully typed, immutable index objects.
 *
 * Dependencies: `js-yaml` (pure JS, no external API calls).
 * No database, no network, no side effects beyond reading files.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { load as yamlLoad } from "js-yaml";
// ---------------------------------------------------------------------------
// Validation helpers — narrow unknown to expected types
// ---------------------------------------------------------------------------
function isString(v) {
    return typeof v === "string";
}
function isStringArray(v) {
    return Array.isArray(v) && v.every(isString);
}
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isObjectArray(v) {
    return Array.isArray(v) && v.every(isRecord);
}
// ---------------------------------------------------------------------------
// Niche dictionary validation
// ---------------------------------------------------------------------------
function validateNicheTerm(raw, index) {
    if (!isRecord(raw)) {
        throw new Error(`terms[${index}]: expected object, got ${typeof raw}`);
    }
    const r = raw;
    if (!isString(r.term) || r.term.trim() === "") {
        throw new Error(`terms[${index}].term: must be a non-empty string`);
    }
    const synonyms = isStringArray(r.synonyms) ? r.synonyms : [];
    const modifiers = isStringArray(r.modifiers) ? r.modifiers : [];
    const term = {
        term: r.term.trim(),
        synonyms: Object.freeze(synonyms.map((s) => s.trim()).filter((s) => s.length > 0)),
        modifiers: Object.freeze(modifiers.map((m) => m.trim()).filter((m) => m.length > 0)),
    };
    const result = {
        ...term,
    };
    if (isString(r.plural) && r.plural.trim() !== "")
        result.plural = r.plural.trim();
    if (isString(r.singular) && r.singular.trim() !== "")
        result.singular = r.singular.trim();
    return Object.freeze(result);
}
function validateNicheDictionary(raw, sourcePath) {
    if (!isRecord(raw)) {
        throw new Error(`${sourcePath}: expected YAML object at root`);
    }
    const r = raw;
    if (r.version !== 1) {
        throw new Error(`${sourcePath}: version must be 1, got ${String(r.version)}`);
    }
    if (!isString(r.niche) || r.niche.trim() === "") {
        throw new Error(`${sourcePath}: niche must be a non-empty string`);
    }
    if (!isObjectArray(r.terms)) {
        throw new Error(`${sourcePath}: terms must be a non-empty array of objects`);
    }
    return Object.freeze({
        version: 1,
        niche: r.niche.trim().toLowerCase(),
        terms: Object.freeze(r.terms.map((t, i) => validateNicheTerm(t, i))),
    });
}
// ---------------------------------------------------------------------------
// Geo dictionary validation
// ---------------------------------------------------------------------------
function validateGeoLocationType(v, path) {
    const valid = new Set([
        "country",
        "state",
        "region",
        "county",
        "city",
        "district",
        "neighbourhood",
        "postal",
    ]);
    if (!isString(v) || !valid.has(v)) {
        throw new Error(`${path}.type: invalid GeoLocationType "${String(v)}"`);
    }
    return v;
}
function validateGeoSubLocation(raw, path) {
    if (!isRecord(raw))
        throw new Error(`${path}: expected object`);
    const r = raw;
    if (!isString(r.name) || r.name.trim() === "") {
        throw new Error(`${path}.name: must be non-empty string`);
    }
    return Object.freeze({
        name: r.name.trim(),
        type: validateGeoLocationType(r.type, path),
        aliases: Object.freeze(isStringArray(r.aliases)
            ? r.aliases.map((a) => a.trim()).filter((a) => a.length > 0)
            : []),
    });
}
function validateGeoRegion(raw, index, sourcePath) {
    if (!isRecord(raw)) {
        throw new Error(`${sourcePath}: regions[${index}] expected object`);
    }
    const r = raw;
    const path = `${sourcePath}: regions[${index}]`;
    if (!isString(r.name) || r.name.trim() === "") {
        throw new Error(`${path}.name: must be non-empty string`);
    }
    const rawSubs = Array.isArray(r.subLocations) ? r.subLocations : [];
    const subLocations = rawSubs.map((s, i) => validateGeoSubLocation(s, `${path}.subLocations[${i}]`));
    return Object.freeze({
        name: r.name.trim(),
        type: validateGeoLocationType(r.type, path),
        aliases: Object.freeze(isStringArray(r.aliases)
            ? r.aliases.map((a) => a.trim()).filter((a) => a.length > 0)
            : []),
        subLocations: Object.freeze(subLocations),
    });
}
function validateGeoDictionary(raw, sourcePath) {
    if (!isRecord(raw)) {
        throw new Error(`${sourcePath}: expected YAML object at root`);
    }
    const r = raw;
    if (r.version !== 1) {
        throw new Error(`${sourcePath}: version must be 1, got ${String(r.version)}`);
    }
    if (!isString(r.country) || r.country.trim() === "") {
        throw new Error(`${sourcePath}: country must be a non-empty string`);
    }
    if (!isString(r.countryCode) || r.countryCode.trim() === "") {
        throw new Error(`${sourcePath}: countryCode must be a non-empty string`);
    }
    if (!isObjectArray(r.regions)) {
        throw new Error(`${sourcePath}: regions must be an array of objects`);
    }
    return Object.freeze({
        version: 1,
        country: r.country.trim(),
        countryCode: r.countryCode.trim().toUpperCase(),
        regions: Object.freeze(r.regions.map((reg, i) => validateGeoRegion(reg, i, sourcePath))),
    });
}
// ---------------------------------------------------------------------------
// File discovery helper
// ---------------------------------------------------------------------------
function yamlFilesIn(dir, prefix) {
    try {
        return readdirSync(dir)
            .filter((f) => (extname(f) === ".yml" || extname(f) === ".yaml") &&
            (!prefix || f.startsWith(prefix)))
            .map((f) => join(dir, f));
    }
    catch {
        return [];
    }
}
function loadYaml(filePath) {
    const content = readFileSync(filePath, "utf8");
    return yamlLoad(content);
}
// ---------------------------------------------------------------------------
// NicheDictionaryIndex implementation
// ---------------------------------------------------------------------------
class NicheDictionaryIndexImpl {
    map;
    constructor(dicts) {
        const m = new Map();
        for (const d of dicts) {
            m.set(d.niche.toLowerCase(), d);
        }
        this.map = m;
    }
    get(niche) {
        return this.map.get(niche.trim().toLowerCase());
    }
    allNiches() {
        return Array.from(this.map.keys());
    }
    get size() {
        return this.map.size;
    }
}
// ---------------------------------------------------------------------------
// GeoDictionaryIndex implementation
// ---------------------------------------------------------------------------
class GeoDictionaryIndexImpl {
    byCode;
    byName;
    constructor(dicts) {
        const byCode = new Map();
        const byName = new Map();
        for (const d of dicts) {
            byCode.set(d.countryCode.toUpperCase(), d);
            byName.set(d.country.toLowerCase(), d);
        }
        this.byCode = byCode;
        this.byName = byName;
    }
    getByCountryCode(code) {
        return this.byCode.get(code.trim().toUpperCase());
    }
    getByCountryName(name) {
        return this.byName.get(name.trim().toLowerCase());
    }
    getSubLocations(regionName) {
        const normalised = regionName.trim().toLowerCase();
        const results = [];
        for (const dict of this.byCode.values()) {
            for (const region of dict.regions) {
                if (region.name.toLowerCase() === normalised) {
                    results.push(...region.subLocations);
                }
            }
        }
        return results;
    }
    get size() {
        return this.byCode.size;
    }
}
// ---------------------------------------------------------------------------
// Public loader functions
// ---------------------------------------------------------------------------
/**
 * Loads all *.yml / *.yaml files from `dir`, validates each as a
 * NicheDictionary, and returns a fast-lookup NicheDictionaryIndex.
 *
 * Throws on the first validation error — callers should treat a
 * corrupt dictionary as a startup failure.
 */
export function loadNicheDictionaries(dir) {
    const files = yamlFilesIn(dir, "niche-");
    const dicts = [];
    for (const filePath of files) {
        try {
            const raw = loadYaml(filePath);
            dicts.push(validateNicheDictionary(raw, filePath));
        }
        catch {
            /* skip invalid */
        }
    }
    return new NicheDictionaryIndexImpl(dicts);
}
/**
 * Loads all *.yml / *.yaml files from `dir`, validates each as a
 * GeoDictionary, and returns a fast-lookup GeoDictionaryIndex.
 */
export function loadGeoDictionaries(dir) {
    const files = yamlFilesIn(dir, "geo-");
    const dicts = [];
    for (const filePath of files) {
        try {
            const raw = loadYaml(filePath);
            dicts.push(validateGeoDictionary(raw, filePath));
        }
        catch {
            /* skip invalid */
        }
    }
    return new GeoDictionaryIndexImpl(dicts);
}
/**
 * Convenience: loads both dictionary types from their respective
 * directories and returns both indexes.
 */
export function loadAllDictionaries(nicheDictionariesDir, geoDictionariesDir) {
    return {
        niches: loadNicheDictionaries(nicheDictionariesDir),
        geo: loadGeoDictionaries(geoDictionariesDir),
    };
}
//# sourceMappingURL=DictionaryLoader.js.map