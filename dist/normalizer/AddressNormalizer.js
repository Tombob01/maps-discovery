/**
 * @module normalizer/AddressNormalizer
 *
 * Normalises raw address strings / field collections into a structured Address.
 * No external geocoding â€” purely string-level structuring.
 */
import { ok, err } from "../core/types/common.js";
export class AddressNormalizer {
    normalize(raw, _context) {
        // We need at least one way to produce a meaningful raw string
        const rawStr = raw.addressRaw ??
            [raw.street, raw.city, raw.state, raw.country].filter(Boolean).join(", ");
        if (!rawStr || rawStr.trim() === "") {
            return err({
                code: "EMPTY_VALUE",
                field: "address",
                raw,
                message: "No address data available to normalise",
            });
        }
        const countryCode = this.inferCountryCode(raw.country);
        const address = {
            raw: rawStr.trim(),
            street: raw.street?.trim() ?? null,
            city: raw.city?.trim() ?? null,
            state: raw.state?.trim() ?? null,
            postalCode: raw.postalCode?.trim() ?? null,
            country: raw.country?.trim() ?? null,
            countryCode,
        };
        return ok(address);
    }
    /** Best-effort ISO 3166-1 alpha-2 derivation from a country name string. */
    inferCountryCode(country) {
        if (!country)
            return null;
        const upper = country.trim().toUpperCase();
        // Already a 2-letter code
        if (/^[A-Z]{2}$/.test(upper))
            return upper;
        // Common country names â†’ codes (expand as needed)
        const map = {
            NIGERIA: "NG",
            GHANA: "GH",
            KENYA: "KE",
            "SOUTH AFRICA": "ZA",
            "UNITED STATES": "US",
            USA: "US",
            "UNITED KINGDOM": "GB",
            UK: "GB",
        };
        return map[upper] ?? null;
    }
}
//# sourceMappingURL=AddressNormalizer.js.map