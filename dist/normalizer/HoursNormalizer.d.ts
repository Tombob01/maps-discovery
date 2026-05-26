/**
 * @module normalizer/HoursNormalizer
 *
 * Parses raw hours strings (e.g. "Mon-Fri: 09:00-17:00") into structured DayHours.
 * Parsing is best-effort; if a line can't be parsed it is silently skipped
 * (hours.parsed will be null rather than returning Err).
 */
import type { IFieldNormalizer, FieldNormalizationErrorDetail, NormalizationContext } from "../core/interfaces/INormalizer.js";
import type { BusinessHours } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
export declare class HoursNormalizer implements IFieldNormalizer<readonly string[] | null, BusinessHours | null> {
    normalize(raw: readonly string[] | null, _context: NormalizationContext): Result<BusinessHours | null, FieldNormalizationErrorDetail>;
}
//# sourceMappingURL=HoursNormalizer.d.ts.map