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
 *   - Produce GoogleMapsRawPayload — no normalization, no transformation
 *
 * Rules:
 *   - Returns null / undefined for any field that cannot be extracted
 *   - Never throws — all errors become null/undefined field values or
 *     are surfaced via the Result return type on page-level operations
 *   - No business logic — extraction only
 */
import { humanDelay } from "./GoogleMapsBrowser.js";
import { sel } from "./selectors.js";
// ---------------------------------------------------------------------------
// Extraction helpers — pure DOM reading, no side effects
// ---------------------------------------------------------------------------
/**
 * Extracts the Google Place ID from a Google Maps listing URL.
 *
 * URL formats observed:
 *   /maps/place/Name/@lat,lng,zoom/data=!...!1s<PLACE_ID>!...
 *   /maps/place/Name/...?...&cid=<CID>
 *
 * Returns undefined if the Place ID cannot be extracted.
 */
function extractPlaceId(url) {
    // Format 1: !1s<placeId>! — most common in modern Maps URLs
    const match1 = url.match(/!1s(ChIJ[^!]+)/);
    if (match1?.[1])
        return decodeURIComponent(match1[1]);
    // Format 2: place_id= query parameter
    try {
        const u = new URL(url);
        const placeId = u.searchParams.get("place_id");
        if (placeId)
            return placeId;
    }
    catch { /* invalid URL */ }
    return undefined;
}
/**
 * Extracts GPS coordinates from a Google Maps URL.
 * URL format: @lat,lng,zoom
 */
function extractCoordinates(url) {
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match?.[1] || !match[2])
        return undefined;
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng))
        return undefined;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return undefined;
    return { lat, lng };
}
/**
 * Safely reads the text content of the first element matching a selector.
 * Returns undefined if no match or text is empty.
 */
async function getText(scope, selector) {
    try {
        const el = await scope.$(selector);
        if (el === null)
            return undefined;
        const text = await el.textContent();
        const trimmed = text?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Safely reads an attribute value from the first element matching a selector.
 */
async function getAttribute(scope, selector, attribute) {
    try {
        const el = await scope.$(selector);
        if (el === null)
            return undefined;
        const val = await el.getAttribute(attribute);
        return val?.trim() ?? undefined;
    }
    catch {
        return undefined;
    }
}
// ---------------------------------------------------------------------------
// GoogleMapsAdapter
// ---------------------------------------------------------------------------
export class GoogleMapsAdapter {
    // ---------------------------------------------------------------------------
    // Sidebar: enumerate result cards
    // ---------------------------------------------------------------------------
    /**
     * Returns all currently-rendered result card elements in the sidebar.
     * The list grows as the sidebar is scrolled — call this after each scroll.
     */
    async getResultCards(page) {
        try {
            return await page.$$(sel("resultItem"));
        }
        catch {
            return [];
        }
    }
    /**
     * Extracts the listing URL from a result card element.
     * Returns undefined if the card has no valid Maps place link.
     */
    async getCardListingUrl(card) {
        return getAttribute(card, sel("resultItemLink"), "href");
    }
    // ---------------------------------------------------------------------------
    // Detail panel: extract all fields for one listing
    // ---------------------------------------------------------------------------
    /**
     * Clicks a result card to open its detail panel, waits for it to load,
     * then extracts all available fields.
     *
     * The caller is responsible for navigating back or selecting the next card.
     */
    async extractFromCard(page, card, searchQuery, resultPosition) {
        // Get the listing URL from the card link before clicking
        const listingUrl = await this.getCardListingUrl(card);
        // Click to open the detail panel
        try {
            await card.click();
            // Wait briefly for the panel to begin rendering
            await humanDelay(600, 1200);
            // Wait for the detail panel to be present
            await page.waitForSelector(sel("detailPanel"), { timeout: 8000 });
            await humanDelay(400, 900);
        }
        catch {
            // If the click fails, return what we can from the card itself
            return this._extractFromCardOnly(card, searchQuery, resultPosition);
        }
        // Extract from the now-open detail panel
        return this._extractFromDetailPanel(page, listingUrl, searchQuery, resultPosition);
    }
    /**
     * Extracts minimal data from just the sidebar card (no detail panel open).
     * Used as fallback when the detail panel cannot be opened.
     */
    async _extractFromCardOnly(card, searchQuery, resultPosition) {
        const listingUrl = await this.getCardListingUrl(card);
        const placeId = listingUrl ? extractPlaceId(listingUrl) : undefined;
        const coords = listingUrl ? extractCoordinates(listingUrl) : undefined;
        const name = await getText(card, sel("businessName"));
        return buildPayload({
            listingUrl,
            placeId,
            coordinates: coords,
            name,
            searchQuery,
            resultPosition,
            detailPanelScraped: false,
        });
    }
    /**
     * Extracts all fields from the detail panel currently displayed on the page.
     */
    async _extractFromDetailPanel(page, listingUrl, searchQuery, resultPosition) {
        const currentUrl = page.url();
        const resolvedUrl = currentUrl.includes("/maps/place/") ? currentUrl : listingUrl;
        const placeId = resolvedUrl ? extractPlaceId(resolvedUrl) : undefined;
        const coords = resolvedUrl ? extractCoordinates(resolvedUrl) : undefined;
        await this._tryExpandHours(page);
        const [name, address, phone, website, ratingText, reviewCountText, categoryText, priceLevelText, openStatusText,] = await Promise.all([
            getText(page, sel("businessName")),
            getText(page, sel("addressRow")),
            this._extractPhone(page),
            this._extractWebsite(page),
            getAttribute(page, sel("ratingAriaLabel"), "aria-label"),
            getAttribute(page, sel("reviewCount"), "aria-label"),
            getText(page, sel("categoryLabel")),
            getAttribute(page, sel("priceLevel"), "aria-label"),
            this._extractOpenStatus(page),
        ]);
        const hoursRaw = await this._extractHoursRaw(page);
        return buildPayload({
            placeId,
            listingUrl: resolvedUrl,
            name,
            address,
            phone,
            website,
            ratingText,
            reviewCountText,
            categoryText,
            priceLevelText,
            openStatusText,
            hoursRaw: hoursRaw.length > 0 ? hoursRaw : undefined,
            coordinates: coords,
            searchQuery,
            resultPosition,
            detailPanelScraped: true,
        });
    }
    // ---------------------------------------------------------------------------
    // Field-specific extractors
    // ---------------------------------------------------------------------------
    async _extractPhone(page) {
        // The phone button has data-item-id="phone:tel:+234..."
        // The tel: part contains the number
        try {
            const phoneBtn = await page.$(sel("phoneRow"));
            if (phoneBtn === null)
                return undefined;
            const itemId = await phoneBtn.getAttribute("data-item-id");
            if (itemId) {
                // data-item-id="phone:tel:+2348012345678" → "+2348012345678"
                const match = itemId.match(/phone:tel:(.+)/);
                if (match?.[1])
                    return decodeURIComponent(match[1]);
            }
            // Fallback: read the visible text
            return getText(page, sel("phoneRow"));
        }
        catch {
            return undefined;
        }
    }
    async _extractWebsite(page) {
        return getAttribute(page, sel("websiteRow"), "href");
    }
    async _extractOpenStatus(page) {
        // Open status appears in various elements; try a few
        try {
            const candidates = [
                'span[jsaction*="openhours"]',
                'div[data-hide-tooltip-on-mobile] span',
            ];
            for (const candidate of candidates) {
                const text = await getText(page, candidate);
                if (text)
                    return text;
            }
            return undefined;
        }
        catch {
            return undefined;
        }
    }
    async _tryExpandHours(page) {
        try {
            const toggle = await page.$(sel("hoursToggle"));
            if (toggle !== null) {
                await toggle.click();
                await humanDelay(300, 600);
            }
        }
        catch { /* non-fatal */ }
    }
    async _extractHoursRaw(page) {
        try {
            const rows = await page.$$(sel("hourRow"));
            const texts = [];
            for (const row of rows) {
                const text = await row.textContent();
                const trimmed = text?.trim();
                if (trimmed && trimmed.length > 0)
                    texts.push(trimmed);
            }
            return texts;
        }
        catch {
            return [];
        }
    }
}
// ---------------------------------------------------------------------------
// Module-level helper: build a GoogleMapsRawPayload omitting undefined fields
// so exactOptionalPropertyTypes is satisfied.
// ---------------------------------------------------------------------------
/**
 * Constructs a GoogleMapsRawPayload from a partial object, omitting any keys
 * whose value is `undefined`. This satisfies `exactOptionalPropertyTypes`:
 * optional fields must be absent rather than explicitly set to `undefined`.
 */
function buildPayload(partial) {
    const result = {};
    if (partial.placeId !== undefined)
        result.placeId = partial.placeId;
    if (partial.listingUrl !== undefined)
        result.listingUrl = partial.listingUrl;
    if (partial.name !== undefined)
        result.name = partial.name;
    if (partial.address !== undefined)
        result.address = partial.address;
    if (partial.phone !== undefined)
        result.phone = partial.phone;
    if (partial.website !== undefined)
        result.website = partial.website;
    if (partial.ratingText !== undefined)
        result.ratingText = partial.ratingText;
    if (partial.reviewCountText !== undefined)
        result.reviewCountText = partial.reviewCountText;
    if (partial.categoryText !== undefined)
        result.categoryText = partial.categoryText;
    if (partial.priceLevelText !== undefined)
        result.priceLevelText = partial.priceLevelText;
    if (partial.openStatusText !== undefined)
        result.openStatusText = partial.openStatusText;
    if (partial.hoursRaw !== undefined)
        result.hoursRaw = partial.hoursRaw;
    if (partial.coordinates !== undefined)
        result.coordinates = partial.coordinates;
    if (partial.searchQuery !== undefined)
        result.searchQuery = partial.searchQuery;
    if (partial.resultPosition !== undefined)
        result.resultPosition = partial.resultPosition;
    if (partial.detailPanelScraped !== undefined)
        result.detailPanelScraped = partial.detailPanelScraped;
    return result;
}
//# sourceMappingURL=GoogleMapsAdapter.js.map