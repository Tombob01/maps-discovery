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

import type {
  INormalizer,
  IProviderMapper,
  NormalizationContext,
  NormalizationErrorDetail,
  RawFields,
} from "../core/interfaces/INormalizer.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type {
  Result,
  BusinessID,
  Fingerprint,
  E164Phone,
} from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";
import { PhoneNormalizer } from "./PhoneNormalizer.js";
import { AddressNormalizer } from "./AddressNormalizer.js";
import { HoursNormalizer } from "./HoursNormalizer.js";
import { fingerprintRecord } from "./fingerprint.js";

export class BusinessNormalizer implements INormalizer {
  private readonly mappers: Map<string, IProviderMapper>;
  private readonly phone: PhoneNormalizer;
  private readonly address: AddressNormalizer;
  private readonly hours: HoursNormalizer;

  constructor(mappers: readonly IProviderMapper[]) {
    this.mappers = new Map(mappers.map((m) => [m.providerId, m]));
    this.phone = new PhoneNormalizer();
    this.address = new AddressNormalizer();
    this.hours = new HoursNormalizer();
  }

  async normalize(
    result: ProviderResult,
    context: NormalizationContext,
  ): Promise<Result<BusinessRecord, NormalizationErrorDetail>> {
    // 1. Find mapper
    const mapper = this.mappers.get(result.providerId);
    if (!mapper) {
      return err({
        code: "INVALID_PROVIDER",
        providerId: result.providerId,
        message: `No mapper registered for provider "${result.providerId}"`,
      });
    }

    // 2. Extract raw fields
    const mappingResult = mapper.extractFields(result.rawPayload);
    if (!mappingResult.ok) {
      return err({
        code: "MAPPING_FAILED",
        providerId: result.providerId,
        message: mappingResult.error.message,
        cause: mappingResult.error,
      });
    }

    const fields: RawFields = mappingResult.value;

    // 3. Name is required
    const name = fields.name?.trim();
    if (!name) {
      return err({
        code: "MISSING_REQUIRED_FIELD",
        providerId: result.providerId,
        message: "Business name is missing or empty",
      });
    }

    // 4. Normalise phone (graceful degradation)
    const phoneResult = this.phone.normalize(fields.phone ?? null, context);
    const normalizedPhone: E164Phone | null = isOk(phoneResult)
      ? phoneResult.value
      : null;

    // 5. Normalise address (graceful degradation)
    // Build without undefined values â€” exactOptionalPropertyTypes requires this
    const addressInput: import("./AddressNormalizer.js").AddressRawInput =
      Object.assign(
        {},
        fields.addressRaw !== undefined
          ? { addressRaw: fields.addressRaw }
          : {},
        fields.street !== undefined ? { street: fields.street } : {},
        fields.city !== undefined ? { city: fields.city } : {},
        fields.state !== undefined ? { state: fields.state } : {},
        fields.postalCode !== undefined
          ? { postalCode: fields.postalCode }
          : {},
        fields.country !== undefined ? { country: fields.country } : {},
      ) as import("./AddressNormalizer.js").AddressRawInput;
    const addressResult = this.address.normalize(addressInput, context);
    const address = isOk(addressResult)
      ? addressResult.value
      : {
          raw: fields.addressRaw ?? "",
          street: fields.street ?? null,
          city: fields.city ?? null,
          state: fields.state ?? null,
          postalCode: fields.postalCode ?? null,
          country: fields.country ?? null,
          countryCode: context.countryCodeHint ?? null,
        };

    // 6. Normalise hours (graceful degradation)
    const hoursResult = this.hours.normalize(fields.hoursRaw ?? null, context);
    const hours = isOk(hoursResult) ? hoursResult.value : null;

    // 7. Price level (1-4 only)
    const rawPrice = fields.priceLevel;
    const priceLevel: 1 | 2 | 3 | 4 | null =
      rawPrice === 1 || rawPrice === 2 || rawPrice === 3 || rawPrice === 4
        ? rawPrice
        : null;

    // 8. Geo
    const geo =
      typeof fields.lat === "number" && typeof fields.lng === "number"
        ? { lat: fields.lat, lng: fields.lng }
        : null;

    // 9. Categories
    const categories = Object.freeze(fields.categories ?? []);
    const primaryCategory = categories[0] ?? null;

    // 10. External IDs
    const externalIds = { ...(fields.externalIds ?? {}) };

    // 11. Build record and fingerprint
    const partial: Omit<BusinessRecord, "id" | "fingerprint"> = {
      externalIds,
      name,
      normalizedName: name.toLowerCase(),
      address,
      geo,
      phone: fields.phone ?? null,
      normalizedPhone,
      website: fields.website ?? null,
      categories,
      primaryCategory,
      rating: fields.rating ?? null,
      reviewCount: fields.reviewCount ?? null,
      hours,
      priceLevel,
      sourceProvider: result.providerId,
      sourceUrl: fields.sourceUrl ?? result.sourceUrl,
      collectedAt: result.collectedAt,
      runId: result.runId,
      queryId: result.queryId,
      normalizationStatus: "complete",
      deduplicationStatus: "pending",
      exportStatus: "pending",
    };

    const fingerprint = fingerprintRecord(partial) as Fingerprint;
    const id = fingerprint as unknown as BusinessID; // id assigned later by persistence layer

    const record: BusinessRecord = {
      ...partial,
      id,
      fingerprint,
    };

    return ok(record);
  }
}
