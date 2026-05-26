/**
 * @module providers/google-maps/selectors
 *
 * All CSS / Playwright selectors for Google Maps in one typed registry.
 *
 * Rules:
 *   - No scraping logic here — only selector strings and their documentation.
 *   - Every selector is tagged with what it finds and its fragility level.
 *   - Fragility: LOW (semantic attribute), MEDIUM (class), HIGH (position-based).
 *   - When Google changes the DOM, update here only.
 *
 * Tested against Google Maps as of mid-2025. Google Maps DOM changes
 * frequently; treat HIGH-fragility selectors as maintenance hotspots.
 */
// ---------------------------------------------------------------------------
// Selectors registry
// ---------------------------------------------------------------------------
export const SELECTORS = {
    // ── Search / navigation ─────────────────────────────────────────────────
    /** Main search input field */
    searchInput: {
        selector: "input#searchboxinput",
        description: "Google Maps main search input",
        fragility: "LOW",
    },
    /** Search submit button */
    searchButton: {
        selector: "button#searchbox-searchbutton",
        description: "Search submit button",
        fragility: "LOW",
    },
    // ── Results list ─────────────────────────────────────────────────────────
    /**
     * The scrollable sidebar that contains the results list.
     * This is the element we scroll to load more results.
     */
    resultsSidebar: {
        selector: 'div[role="feed"]',
        description: "Scrollable results feed / sidebar",
        fragility: "LOW",
    },
    /**
     * Individual result card in the sidebar list.
     * Each card represents one business listing.
     */
    resultItem: {
        selector: 'div[role="feed"] > div:has(a[href*="/maps/place/"])',
        description: "Individual business result card in sidebar",
        fragility: "MEDIUM",
    },
    /**
     * The anchor element inside each result card that links to the place page.
     * Its href contains the data-cid / place_id and the business URL.
     */
    resultItemLink: {
        selector: 'a[href*="/maps/place/"]',
        description: "Link to business detail page within result card",
        fragility: "LOW",
    },
    /**
     * Sentinel element at the bottom of the results feed.
     * Visible when all results have loaded (no more pages to scroll).
     */
    endOfResultsSentinel: {
        selector: "span.HlvSq",
        description: 'End-of-results sentinel / "You\'ve reached the end" marker',
        fragility: "HIGH",
    },
    /**
     * Alternative end-of-results marker — the "No more results" text container.
     */
    noMoreResultsText: {
        selector: 'div[role="feed"] p.fontBodyMedium',
        description: "No-more-results / end-of-list paragraph",
        fragility: "HIGH",
    },
    // ── Detail panel (shown when a result card is clicked) ───────────────────
    /** Outer wrapper of the business detail panel */
    detailPanel: {
        selector: 'div[role="main"]',
        description: "Business detail panel root",
        fragility: "LOW",
    },
    /** Business name heading in the detail panel */
    businessName: {
        selector: "h1.DUwDvf",
        description: "Business name heading in detail panel",
        fragility: "HIGH",
    },
    /**
     * Rating value — e.g. "4.5"
     * The aria-label on the star widget contains the full string "4.5 stars".
     */
    ratingAriaLabel: {
        selector: 'div[role="img"][aria-label*="stars"]',
        description: "Star rating widget with aria-label containing the numeric rating",
        fragility: "MEDIUM",
    },
    /** Review count element — e.g. "(123)" */
    reviewCount: {
        selector: 'span[aria-label*="reviews"]',
        description: "Review count with aria-label",
        fragility: "MEDIUM",
    },
    /** Address row in the detail panel info section */
    addressRow: {
        selector: 'button[data-item-id="address"]',
        description: "Address button in detail info section",
        fragility: "LOW",
    },
    /** Phone number row */
    phoneRow: {
        selector: 'button[data-item-id^="phone:tel:"]',
        description: "Phone number button with data-item-id starting phone:tel:",
        fragility: "LOW",
    },
    /** Website row */
    websiteRow: {
        selector: 'a[data-item-id="authority"]',
        description: "Website link with data-item-id=authority",
        fragility: "LOW",
    },
    /** Category label (e.g. "Plumber", "Plumbing supply store") */
    categoryLabel: {
        selector: 'button[jsaction*="category"]',
        description: "Category label button in detail header",
        fragility: "MEDIUM",
    },
    /**
     * Hours section toggle button.
     * Expanding reveals the full weekly hours table.
     */
    hoursToggle: {
        selector: 'div[aria-label*="hours"] > div[role="button"]',
        description: "Opening hours toggle button",
        fragility: "MEDIUM",
    },
    /** Individual hour row after the toggle is expanded */
    hourRow: {
        selector: "tr.y0skZc",
        description: "Hour row in expanded hours table",
        fragility: "HIGH",
    },
    /** Price level indicator (e.g. "€€") */
    priceLevel: {
        selector: 'span[aria-label*="Price"]',
        description: "Price level span with aria-label",
        fragility: "MEDIUM",
    },
    // ── Anti-bot / error states ───────────────────────────────────────────────
    /**
     * CAPTCHA / consent screen indicators.
     * If any of these are visible, the session is challenged.
     */
    captchaFrame: {
        selector: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
        description: "reCAPTCHA iframe — session is being challenged",
        fragility: "LOW",
    },
    consentDialog: {
        selector: 'div[aria-modal="true"] button[aria-label*="Accept"]',
        description: "Cookie consent dialog accept button",
        fragility: "MEDIUM",
    },
    /** "Something went wrong" error overlay */
    errorOverlay: {
        selector: "div.M19K8b",
        description: "Google Maps error overlay",
        fragility: "HIGH",
    },
};
/** Helper: extract just the selector string by key. */
export function sel(key) {
    return SELECTORS[key].selector;
}
//# sourceMappingURL=selectors.js.map