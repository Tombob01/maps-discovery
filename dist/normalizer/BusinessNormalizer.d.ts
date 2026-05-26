/**
 * @module normalizer/BusinessNormalizer
 *
 * Top-level normalizer. Orchestrates:
 *   1. IProviderMapper  â†’ RawFields
 *   2. PhoneNormalizer  â†’ E164Phone | null
 *   3. AddressNormalizer â†’ Address
 *   4. HoursNormalizer  â†’ BusinessHours | null
 *   â†’ BusinessRecord
 *
 * Partial field failures (phone, hours) degrade gracefully to null rather
 * than surfacing as Err. The only hard Err cases are:
 *   - No mapper registered for the provider
 *   - Mapper fails (structurally invalid payload)
 *   - Name is missing (non-recoverable)
 */
import type { INormalizer, IProviderMapper, NormalizationContext, NormalizationErrorDetail } from "../core/interfaces/INormalizer.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { Result } from "../core/types/common.js";
export declare class BusinessNormalizer implements INormalizer {
    private readonly mappers;
    private readonly phone;
    private readonly address;
    private readonly hours;
    constructor(mappers: readonly IProviderMapper[]);
    normalize(result: ProviderResult, context: NormalizationContext): Promise<Result<BusinessRecord, NormalizationErrorDetail>>;
}
//# sourceMappingURL=BusinessNormalizer.d.ts.map