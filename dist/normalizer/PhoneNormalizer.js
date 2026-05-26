/**
 * @module normalizer/PhoneNormalizer
 *
 * Normalises raw phone strings to E.164 format using libphonenumber-js.
 * Falls back gracefully when parsing fails.
 */
import { parsePhoneNumber, isValidPhoneNumber, } from "libphonenumber-js";
import { ok, err } from "../core/types/common.js";
export class PhoneNormalizer {
    normalize(raw, context) {
        if (raw === null || raw.trim() === "") {
            return ok(null);
        }
        const cleaned = raw.trim();
        const countryCode = (context.countryCodeHint?.toUpperCase() ??
            "US");
        try {
            // Try with country hint first
            if (isValidPhoneNumber(cleaned, countryCode)) {
                const parsed = parsePhoneNumber(cleaned, countryCode);
                return ok(parsed.format("E.164"));
            }
            // Try international format (no hint)
            if (cleaned.startsWith("+")) {
                const parsed = parsePhoneNumber(cleaned);
                if (parsed.isValid()) {
                    return ok(parsed.format("E.164"));
                }
            }
            return err({
                code: "INVALID_FORMAT",
                field: "phone",
                raw,
                message: `Phone number "${cleaned}" is not valid for country ${countryCode}`,
            });
        }
        catch (e) {
            return err({
                code: "PARSE_FAILED",
                field: "phone",
                raw,
                message: `Failed to parse phone number: ${String(e)}`,
            });
        }
    }
}
//# sourceMappingURL=PhoneNormalizer.js.map