/**
 * @module normalizer/GoogleMapsProviderMapper
 *
 * Maps the raw payload from the GoogleMapsProvider into the intermediate
 * RawFields shape the BusinessNormalizer understands.
 */

import type {
  IProviderMapper,
  RawFields,
  MappingErrorDetail,
} from "../core/interfaces/INormalizer.js";
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

/** Build RawFields without assigning `undefined` to optional props (exactOptionalPropertyTypes). */
function buildFields(
  p: Record<string, unknown>,
  externalIds: Record<string, string>,
): RawFields {
  const f: RawFields = {};
  const s = (key: string): string | undefined => asString(p[key]);
  const n = (key: string): number | undefined => asNumber(p[key]);
  const a = (key: string): readonly string[] | undefined =>
    asStringArray(p[key]);

  if (s("name") !== undefined) (f as Record<string, unknown>).name = s("name");
  if (s("phone") !== undefined)
    (f as Record<string, unknown>).phone = s("phone");
  if (s("website") !== undefined)
    (f as Record<string, unknown>).website = s("website");
  if (s("address") !== undefined)
    (f as Record<string, unknown>).addressRaw = s("address");
  if (s("street") !== undefined)
    (f as Record<string, unknown>).street = s("street");
  if (s("city") !== undefined) (f as Record<string, unknown>).city = s("city");
  if (s("state") !== undefined)
    (f as Record<string, unknown>).state = s("state");
  if (s("postalCode") !== undefined)
    (f as Record<string, unknown>).postalCode = s("postalCode");
  if (s("country") !== undefined)
    (f as Record<string, unknown>).country = s("country");
  if (n("lat") !== undefined) (f as Record<string, unknown>).lat = n("lat");
  if (n("lng") !== undefined) (f as Record<string, unknown>).lng = n("lng");
  if (n("rating") !== undefined)
    (f as Record<string, unknown>).rating = n("rating");
  if (n("reviewCount") !== undefined)
    (f as Record<string, unknown>).reviewCount = n("reviewCount");
  if (n("priceLevel") !== undefined)
    (f as Record<string, unknown>).priceLevel = n("priceLevel");
  if (a("categories") !== undefined)
    (f as Record<string, unknown>).categories = a("categories");
  if (a("hours") !== undefined)
    (f as Record<string, unknown>).hoursRaw = a("hours");
  if (s("url") !== undefined)
    (f as Record<string, unknown>).sourceUrl = s("url");
  if (Object.keys(externalIds).length > 0)
    (f as Record<string, unknown>).externalIds = externalIds;

  return f;
}

export class GoogleMapsProviderMapper implements IProviderMapper {
  readonly providerId = "google-maps";

  extractFields(rawPayload: unknown): Result<RawFields, MappingErrorDetail> {
    if (!isObject(rawPayload)) {
      return err({
        code: "INVALID_PAYLOAD_SHAPE",
        providerId: this.providerId,
        message: "rawPayload must be a plain object",
      });
    }

    const p = rawPayload;

    // name is required
    if (!asString(p.name)) {
      return err({
        code: "MISSING_REQUIRED_KEY",
        providerId: this.providerId,
        message: "rawPayload.name is required",
      });
    }

    const externalIds: Record<string, string> = {};
    const placeId = asString(p.placeId);
    if (placeId) externalIds.googlePlaceId = placeId;

    return ok(buildFields(p, externalIds));
  }
}
