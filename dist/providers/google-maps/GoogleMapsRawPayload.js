/**
 * @module providers/google-maps/GoogleMapsRawPayload
 *
 * The typed shape of the raw data extracted from a Google Maps listing.
 * This is what goes into ProviderResult.rawPayload.
 *
 * Rules:
 *   - All fields are optional — extraction may fail for any individual field.
 *   - No normalisation here — strings are preserved exactly as scraped.
 *   - The Normalizer (future) reads this shape via IProviderMapper.
 *   - Types reflect what the DOM actually provides, not what we'd prefer.
 */
export {};
//# sourceMappingURL=GoogleMapsRawPayload.js.map