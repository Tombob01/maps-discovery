/**
 * @module normalizer/fingerprint
 *
 * Produces a deterministic SHA-256-like fingerprint string from
 * the stable identity fields of a (partial) BusinessRecord.
 *
 * Uses a pure-JS djb2 hash to avoid requiring Node crypto in tests;
 * the format is hex-like to satisfy Fingerprint brand expectations.
 *
 * Fields contributing to the fingerprint (normalised, nulls removed):
 *   - normalizedName
 *   - address.city (lower)
 *   - address.country (lower)
 *   - normalizedPhone
 */
/** djb2 hash → 16-char hex string */
function djb2hex(s) {
    let hash = 5381;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) + hash) ^ (s.charCodeAt(i) & 0xff);
        hash = hash | 0; // keep 32-bit signed
    }
    // Convert to unsigned hex, pad to ensure consistent length
    const unsigned = hash >>> 0;
    return unsigned.toString(16).padStart(8, "0");
}
export function fingerprintRecord(record) {
    const parts = [
        record.normalizedName,
        record.address.city?.toLowerCase() ?? "",
        record.address.country?.toLowerCase() ?? "",
        record.normalizedPhone ?? "",
    ];
    const raw = parts.join("|");
    // Double-hash for a slightly longer output resembling a real fingerprint
    return djb2hex(raw) + djb2hex(raw + raw);
}
//# sourceMappingURL=fingerprint.js.map