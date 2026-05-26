/**
 * @module providers/google-maps/GoogleMapsAdapter
 *
 * Extracts structured raw data from Google Maps DOM.
 *
 * Responsibilities:
 *   - Read result cards from the sidebar list
 *   - Open each card's detail panel and extract all available fields
 *   - Extract the Place ID from the listing URL
 *   - Extract GPS coordinates from the URL or map state
 *   - Produce GoogleMapsRawPayload â€” no normalization, no transformation
 *
 * Rules:
 *   - Returns null / undefined for any field that cannot be extracted
 *   - Never throws â€” all errors become null/undefined field values or
 *     are surfaced via the Result return type on page-level operations
 *   - No business logic â€” extraction only
 */
import type { GoogleMapsRawPayload } from "./GoogleMapsRawPayload.js";
import type { Page, ElementHandle } from "playwright";
export declare class GoogleMapsAdapter {
    /**
     * Returns all currently-rendered result card elements in the sidebar.
     * The list grows as the sidebar is scrolled â€” call this after each scroll.
     */
    getResultCards(page: Page): Promise<ElementHandle[]>;
    /**
     * Extracts the listing URL from a result card element.
     * Returns undefined if the card has no valid Maps place link.
     */
    getCardListingUrl(card: ElementHandle): Promise<string | undefined>;
    /**
     * Clicks a result card to open its detail panel, waits for it to load,
     * then extracts all available fields.
     *
     * The caller is responsible for navigating back or selecting the next card.
     */
    extractFromCard(page: Page, card: ElementHandle, searchQuery: string, resultPosition: number): Promise<GoogleMapsRawPayload>;
    /**
     * Extracts minimal data from just the sidebar card (no detail panel open).
     * Used as fallback when the detail panel cannot be opened.
     */
    private _extractFromCardOnly;
    /**
     * Extracts all fields from the detail panel currently displayed on the page.
     */
    private _extractFromDetailPanel;
    private _extractPhone;
    private _extractWebsite;
    private _extractOpenStatus;
    private _tryExpandHours;
    private _extractHoursRaw;
}
//# sourceMappingURL=GoogleMapsAdapter.d.ts.map