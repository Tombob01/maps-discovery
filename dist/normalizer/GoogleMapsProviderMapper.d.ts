/**
 * @module normalizer/GoogleMapsProviderMapper
 *
 * Maps the raw payload from the GoogleMapsProvider into the intermediate
 * RawFields shape the BusinessNormalizer understands.
 */
import type { IProviderMapper, RawFields, MappingErrorDetail } from "../core/interfaces/INormalizer.js";
import type { Result } from "../core/types/common.js";
export declare class GoogleMapsProviderMapper implements IProviderMapper {
    readonly providerId = "google-maps";
    extractFields(rawPayload: unknown): Result<RawFields, MappingErrorDetail>;
}
//# sourceMappingURL=GoogleMapsProviderMapper.d.ts.map