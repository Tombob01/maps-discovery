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
/**
 * Raw data scraped from a single Google Maps business listing card
 * in the sidebar + detail panel.
 */
export interface GoogleMapsRawPayload {
    /**
     * Google Place ID — extracted from the listing URL or data attribute.
     * Format: "ChIJ..." — alphanumeric, base64-like.
     * Used as the providerResultId for idempotency.
     */
    placeId?: string;
    /**
     * Full URL of the Google Maps listing page for this business.
     * e.g. "https://www.google.com/maps/place/Ace+Plumbers/..."
     */
    listingUrl?: string;
    /** Business name exactly as shown in the Google Maps UI. */
    name?: string;
    /**
     * Raw address string as displayed. May include country or not.
     * e.g. "14 Broad Street, Lagos Island, Lagos"
     */
    address?: string;
    /**
     * Raw phone number string as displayed.
     * e.g. "+234 801 234 5678" or "0801 234 5678"
     */
    phone?: string;
    /**
     * Website URL as displayed.
     * e.g. "aceplumbers.ng" (may lack protocol).
     */
    website?: string;
    /**
     * Rating string as scraped from aria-label.
     * e.g. "4.5 stars" — Normalizer extracts the numeric part.
     */
    ratingText?: string;
    /**
     * Review count string as scraped.
     * e.g. "123 reviews" or "(1,234)" — Normalizer strips punctuation.
     */
    reviewCountText?: string;
    /**
     * Category label(s) as scraped.
     * May be a single string "Plumber" or comma-separated "Plumber, Electrician".
     */
    categoryText?: string;
    /**
     * Price level indicator as scraped.
     * e.g. "€", "€€", "€€€", "€€€€" or "$", "$$", etc.
     */
    priceLevelText?: string;
    /**
     * Raw opening hours strings scraped from the expanded hours table.
     * e.g. ["Monday: 8:00 AM – 6:00 PM", "Tuesday: 8:00 AM – 6:00 PM", ...]
     * Normalizer parses these into structured DayHours objects.
     */
    hoursRaw?: string[];
    /**
     * Current open/closed status string.
     * e.g. "Open now", "Closed", "Opens 8 AM"
     */
    openStatusText?: string;
    /**
     * GPS coordinates extracted from the listing URL or map pin.
     * e.g. { lat: 6.5244, lng: 3.3792 }
     */
    coordinates?: {
        lat: number;
        lng: number;
    };
    /**
     * The search query text that produced this result.
     * Preserved for debugging — not a business attribute.
     */
    searchQuery?: string;
    /**
     * 1-based position of this result in the sidebar list at time of extraction.
     * Useful for analyzing result ranking.
     */
    resultPosition?: number;
    /**
     * Whether the detail panel was opened and scraped for this result.
     * If false, only sidebar card data is available.
     */
    detailPanelScraped?: boolean;
}
//# sourceMappingURL=GoogleMapsRawPayload.d.ts.map