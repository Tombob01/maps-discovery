/**
 * @module normalizer/fingerprint
 *
 * Produces a deterministic SHA-256-like fingerprint string from
 * the stable identity fields of a (partial) BusinessRecord.
 *
 * Uses a pure-JS djb2 hash to avoid requiring Node crypto in tests;
 * the format is hex-like to satisfy Fingerprint brand expectations.
 *
 * Identity key selection:
 *   - If externalIds.googlePlaceId is present: (sourceProvider, "placeId",
 *     googlePlaceId) alone determines the fingerprint.
 *   - Otherwise, falls back to (normalizedName, address.city (lower),
 *     address.country (lower), normalizedPhone), all normalised, nulls
 *     removed.
 */

import type { BusinessRecord } from "../core/models/BusinessRecord.js";

type PartialRecord = Omit<BusinessRecord, "id" | "fingerprint">;

/** djb2 hash → 16-char hex string */
function djb2hex(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ (s.charCodeAt(i) & 0xff);
    hash = hash | 0; // keep 32-bit signed
  }
  // Convert to unsigned hex, pad to ensure consistent length
  const unsigned = hash >>> 0;
  return unsigned.toString(16).padStart(8, "0");
}

export function fingerprintRecord(record: PartialRecord): string {
  // Google Place ID is the strongest identity signal available: it is a
  // stable, provider-assigned identifier for a specific real-world
  // listing, unaffected by name-string variance, missing phone data, or
  // city/country normalization gaps. When present, it alone determines
  // identity for that provider's listing -- two records sharing the same
  // (sourceProvider, googlePlaceId) pair are the same real-world listing
  // by definition, regardless of any other field.
  //
  // When absent (e.g. only sidebar-card data was scraped, no detail
  // panel), the prior four-field fallback is used unchanged.
  const placeId = record.externalIds?.googlePlaceId?.trim();

  const parts =
    placeId !== undefined && placeId !== ""
      ? [record.sourceProvider, "placeId", placeId]
      : [
          record.normalizedName,
          record.address.city?.toLowerCase() ?? "",
          record.address.country?.toLowerCase() ?? "",
          record.normalizedPhone ?? "",
        ];

  const raw = parts.join("|");
  // Double-hash for a slightly longer output resembling a real fingerprint
  return djb2hex(raw) + djb2hex(raw + raw);
}
