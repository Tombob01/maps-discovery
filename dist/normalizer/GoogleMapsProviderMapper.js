/**
 * @module normalizer/GoogleMapsProviderMapper
 *
 * Maps the raw payload from the GoogleMapsProvider into the intermediate
 * RawFields shape the BusinessNormalizer understands.
 */
import { ok, err } from "../core/types/common.js";
function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asString(v) {
    return typeof v === "string" ? v : undefined;
}
function asNumber(v) {
    return typeof v === "number" ? v : undefined;
}
function asStringArray(v) {
    if (!Array.isArray(v))
        return undefined;
    return v.filter((x) => typeof x === "string");
}
/** Build RawFields without assigning `undefined` to optional props (exactOptionalPropertyTypes). */
function buildFields(p, externalIds) {
    const f = {};
    const s = (key) => asString(p[key]);
    const n = (key) => asNumber(p[key]);
    const a = (key) => asStringArray(p[key]);
    if (s("name") !== undefined)
        f.name = s("name");
    if (s("phone") !== undefined)
        f.phone = s("phone");
    if (s("website") !== undefined)
        f.website = s("website");
    if (s("address") !== undefined)
        f.addressRaw = s("address");
    if (s("street") !== undefined)
        f.street = s("street");
    if (s("city") !== undefined)
        f.city = s("city");
    if (s("state") !== undefined)
        f.state = s("state");
    if (s("postalCode") !== undefined)
        f.postalCode = s("postalCode");
    if (s("country") !== undefined)
        f.country = s("country");
    if (n("lat") !== undefined)
        f.lat = n("lat");
    if (n("lng") !== undefined)
        f.lng = n("lng");
    if (n("rating") !== undefined)
        f.rating = n("rating");
    if (n("reviewCount") !== undefined)
        f.reviewCount = n("reviewCount");
    if (n("priceLevel") !== undefined)
        f.priceLevel = n("priceLevel");
    if (a("categories") !== undefined)
        f.categories = a("categories");
    if (a("hours") !== undefined)
        f.hoursRaw = a("hours");
    if (s("url") !== undefined)
        f.sourceUrl = s("url");
    if (Object.keys(externalIds).length > 0)
        f.externalIds = externalIds;
    return f;
}
export class GoogleMapsProviderMapper {
    providerId = "google-maps";
    extractFields(rawPayload) {
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
        const externalIds = {};
        const placeId = asString(p.placeId);
        if (placeId)
            externalIds.googlePlaceId = placeId;
        return ok(buildFields(p, externalIds));
    }
}
//# sourceMappingURL=GoogleMapsProviderMapper.js.map