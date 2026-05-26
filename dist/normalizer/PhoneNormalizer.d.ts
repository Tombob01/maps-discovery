/**
 * @module normalizer/PhoneNormalizer
 *
 * Normalises raw phone strings to E.164 format using libphonenumber-js.
 * Falls back gracefully when parsing fails.
 */
import type { IFieldNormalizer, FieldNormalizationErrorDetail, NormalizationContext } from "../core/interfaces/INormalizer.js";
import type { E164Phone, Result } from "../core/types/common.js";
export declare class PhoneNormalizer implements IFieldNormalizer<string | null, E164Phone | null> {
    normalize(raw: string | null, context: NormalizationContext): Result<E164Phone | null, FieldNormalizationErrorDetail>;
}
//# sourceMappingURL=PhoneNormalizer.d.ts.map