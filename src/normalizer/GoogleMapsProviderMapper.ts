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

/**
 * Parses a rating string like "4.5 stars" into a number.
 * Extracts the leading numeric portion via parseFloat.
 * Returns undefined if the result is not a finite number in 0-5 range.
 */
function parseRating(v: unknown): number | undefined {
  const str = asString(v);
  if (str === undefined) return undefined;
  const n = parseFloat(str);
  if (!isFinite(n) || n < 0 || n > 5) return undefined;
  return n;
}

/**
 * Parses a review count string like "4 reviews" or "(1,234)" into a number.
 * Strips all non-digit characters then parses as integer.
 * Returns undefined if the result is not a positive finite integer.
 */
function parseReviewCount(v: unknown): number | undefined {
  const str = asString(v);
  if (str === undefined) return undefined;
  const digits = str.replace(/\D/g, "");
  if (digits.length === 0) return undefined;
  const n = parseInt(digits, 10);
  if (!isFinite(n) || n < 0) return undefined;
  return n;
}

/**
 * Parses a category string like "Plumber" or "Plumber, Electrician"
 * into a string array by splitting on ", ".
 * Returns undefined if the result is empty.
 */
function parseCategories(v: unknown): string[] | undefined {
  const str = asString(v);
  if (str === undefined) return undefined;
  const parts = str.split(", ").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  return parts;
}

/**
 * Extracts lat and lng from a coordinates object like { lat: 6.5244, lng: 3.3792 }.
 * Returns undefined if the object is missing or values are not valid numbers.
 */
function parseCoordinates(
  v: unknown,
): { lat: number; lng: number } | undefined {
  if (!isObject(v)) return undefined;
  const lat = asNumber(v["lat"]);
  const lng = asNumber(v["lng"]);
  if (lat === undefined || lng === undefined) return undefined;
  if (!isFinite(lat) || !isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
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

  // Coordinates: adapter writes { coordinates: { lat, lng } } as a nested object
  const coords = parseCoordinates(p["coordinates"]);
  if (coords !== undefined) {
    (f as Record<string, unknown>).lat = coords.lat;
    (f as Record<string, unknown>).lng = coords.lng;
  }

  // Rating: adapter writes ratingText as a string e.g. "4.5 stars"
  const rating = parseRating(p["ratingText"]);
  if (rating !== undefined) (f as Record<string, unknown>).rating = rating;

  // Review count: adapter writes reviewCountText as a string e.g. "4 reviews"
  const reviewCount = parseReviewCount(p["reviewCountText"]);
  if (reviewCount !== undefined)
    (f as Record<string, unknown>).reviewCount = reviewCount;

  // Price level: adapter writes priceLevelText (currently absent from runtime payload)
  // Left as numeric read for forward compatibility when the field becomes available
  if (n("priceLevel") !== undefined)
    (f as Record<string, unknown>).priceLevel = n("priceLevel");

  // Categories: adapter writes categoryText as a string e.g. "Plumber"
  const categories = parseCategories(p["categoryText"]);
  if (categories !== undefined)
    (f as Record<string, unknown>).categories = categories;

  // Hours: adapter writes hoursRaw as a string array
  if (a("hoursRaw") !== undefined)
    (f as Record<string, unknown>).hoursRaw = a("hoursRaw");

  if (a("services") !== undefined)
    (f as Record<string, unknown>).services = a("services");

  // Source URL: adapter writes listingUrl, not url
  if (s("listingUrl") !== undefined)
    (f as Record<string, unknown>).sourceUrl = s("listingUrl");

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
