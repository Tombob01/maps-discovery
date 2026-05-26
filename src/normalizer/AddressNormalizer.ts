/**
 * @module normalizer/AddressNormalizer
 *
 * Normalises raw address strings / field collections into a structured Address.
 * No external geocoding â€” purely string-level structuring.
 */

import type {
  IFieldNormalizer,
  FieldNormalizationErrorDetail,
  RawFields,
  NormalizationContext,
} from "../core/interfaces/INormalizer.js";
import type { Address } from "../core/types/geo.js";
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";

/** Input shape for AddressNormalizer â€” the subset of RawFields it cares about. */
export type AddressRawInput = Pick<
  RawFields,
  "addressRaw" | "street" | "city" | "state" | "postalCode" | "country"
>;

export class AddressNormalizer implements IFieldNormalizer<
  AddressRawInput,
  Address
> {
  normalize(
    raw: AddressRawInput,
    _context: NormalizationContext,
  ): Result<Address, FieldNormalizationErrorDetail> {
    // We need at least one way to produce a meaningful raw string
    const rawStr =
      raw.addressRaw ??
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

    const address: Address = {
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
  private inferCountryCode(country: string | undefined): string | null {
    if (!country) return null;
    const upper = country.trim().toUpperCase();

    // Already a 2-letter code
    if (/^[A-Z]{2}$/.test(upper)) return upper;

    // Common country names â†’ codes (expand as needed)
    const map: Record<string, string> = {
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
