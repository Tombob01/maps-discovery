/**
 * @module normalizer/AddressNormalizer
 *
 * Normalises raw address strings / field collections into a structured Address.
 * No external geocoding â€” purely string-level structuring.
 */
import type { IFieldNormalizer, FieldNormalizationErrorDetail, RawFields, NormalizationContext } from "../core/interfaces/INormalizer.js";
import type { Address } from "../core/types/geo.js";
import type { Result } from "../core/types/common.js";
/** Input shape for AddressNormalizer â€” the subset of RawFields it cares about. */
export type AddressRawInput = Pick<RawFields, "addressRaw" | "street" | "city" | "state" | "postalCode" | "country">;
export declare class AddressNormalizer implements IFieldNormalizer<AddressRawInput, Address> {
    normalize(raw: AddressRawInput, _context: NormalizationContext): Result<Address, FieldNormalizationErrorDetail>;
    /** Best-effort ISO 3166-1 alpha-2 derivation from a country name string. */
    private inferCountryCode;
}
//# sourceMappingURL=AddressNormalizer.d.ts.map