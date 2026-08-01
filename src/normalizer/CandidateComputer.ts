/**
 * @module normalizer/CandidateComputer
 *
 * Canonical, single-source computation of normalized candidate identity
 * data. This is the one component where field-level normalization
 * (phone, address, hours) and fingerprint computation occur.
 * BusinessNormalizer and ProposalBuilder both consume this component's
 * output as two independent projections; neither duplicates this logic,
 * and neither constructs its own copy of the sub-normalizers or mapper
 * registry — both may share a single CandidateComputer instance.
 *
 * Not part of the public INormalizer contract. Intended for use only
 * within the normalizer package.
 */

import type {
  IProviderMapper,
  NormalizationContext,
  NormalizationErrorDetail,
  RawFields,
} from "../core/interfaces/INormalizer.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { CandidateFields } from "../core/models/CandidateIdentity.js";
import type { Result, Fingerprint, E164Phone } from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";
import { PhoneNormalizer } from "./PhoneNormalizer.js";
import { AddressNormalizer } from "./AddressNormalizer.js";
import { HoursNormalizer } from "./HoursNormalizer.js";
import { fingerprintRecord } from "./fingerprint.js";

/**
 * Canonical candidate identity data, computed once from a raw provider
 * result. This is the shared source both BusinessRecord and
 * IdentityProposal are projected from — it is not itself a public or
 * authoritative representation.
 */
export interface CandidateBundle extends CandidateFields {
  /**
   * The deterministic candidate-matching key computed by the unmodified
   * fingerprintRecord(). Its meaning differs by projection — an
   * authority key on BusinessRecord, a candidate-matching signal on
   * IdentityProposal — but the computation itself is identical in both
   * cases.
   */
  readonly computedFingerprint: Fingerprint;
}

/**
 * Narrow adapter satisfying fingerprintRecord()'s parameter type without
 * any `unknown` cast.
 *
 * fingerprintRecord() is verified (against its unmodified source) to
 * read only normalizedName, address.city, address.country, and
 * normalizedPhone. Its parameter type nonetheless requires the full
 * Omit<BusinessRecord, "id"|"fingerprint"> shape, which includes three
 * status fields that do not exist on CandidateFields (they belong only
 * to the BusinessRecord projection, assembled later by
 * BusinessNormalizer). This adapter supplies fixed, correctly-typed
 * placeholder values for those unread fields so the call satisfies the
 * compiler through ordinary structural typing — no cast of any kind is
 * required, and fingerprint.ts's signature and algorithm are untouched.
 */
function toFingerprintInput(
  fields: CandidateFields,
): Omit<BusinessRecord, "id" | "fingerprint"> {
  return {
    ...fields,
    normalizationStatus: "complete",
    deduplicationStatus: "pending",
    exportStatus: "pending",
  };
}

export class CandidateComputer {
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

  compute(
    result: ProviderResult,
    context: NormalizationContext,
  ): Result<CandidateBundle, NormalizationErrorDetail> {
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

    // 11. Assemble candidate fields and compute the fingerprint via the
    // narrow, fully-typed adapter (no `unknown` cast).
    const candidateFields: CandidateFields = {
      externalIds,
      name,
      normalizedName: name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim(),
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
      services: fields.services ? Object.freeze([...fields.services]) : null,
      sourceProvider: result.providerId,
      sourceUrl: fields.sourceUrl ?? result.sourceUrl,
      collectedAt: result.collectedAt,
      runId: result.runId,
      queryId: result.queryId,
    };

    const computedFingerprint = fingerprintRecord(
      toFingerprintInput(candidateFields),
    ) as Fingerprint;

    return ok({ ...candidateFields, computedFingerprint });
  }
}
