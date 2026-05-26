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
export interface SelectorEntry {
    /** The CSS/ARIA selector string. */
    readonly selector: string;
    /** Human-readable description of what this matches. */
    readonly description: string;
    /**
     * Fragility assessment:
     *   LOW    — semantic attribute unlikely to change
     *   MEDIUM — class name, may change with UI updates
     *   HIGH   — positional or deeply nested, changes frequently
     */
    readonly fragility: "LOW" | "MEDIUM" | "HIGH";
}
export declare const SELECTORS: {
    /** Main search input field */
    readonly searchInput: {
        readonly selector: "input#searchboxinput";
        readonly description: "Google Maps main search input";
        readonly fragility: "LOW";
    };
    /** Search submit button */
    readonly searchButton: {
        readonly selector: "button#searchbox-searchbutton";
        readonly description: "Search submit button";
        readonly fragility: "LOW";
    };
    /**
     * The scrollable sidebar that contains the results list.
     * This is the element we scroll to load more results.
     */
    readonly resultsSidebar: {
        readonly selector: "div[role=\"feed\"]";
        readonly description: "Scrollable results feed / sidebar";
        readonly fragility: "LOW";
    };
    /**
     * Individual result card in the sidebar list.
     * Each card represents one business listing.
     */
    readonly resultItem: {
        readonly selector: "div[role=\"feed\"] > div:has(a[href*=\"/maps/place/\"])";
        readonly description: "Individual business result card in sidebar";
        readonly fragility: "MEDIUM";
    };
    /**
     * The anchor element inside each result card that links to the place page.
     * Its href contains the data-cid / place_id and the business URL.
     */
    readonly resultItemLink: {
        readonly selector: "a[href*=\"/maps/place/\"]";
        readonly description: "Link to business detail page within result card";
        readonly fragility: "LOW";
    };
    /**
     * Sentinel element at the bottom of the results feed.
     * Visible when all results have loaded (no more pages to scroll).
     */
    readonly endOfResultsSentinel: {
        readonly selector: "span.HlvSq";
        readonly description: "End-of-results sentinel / \"You've reached the end\" marker";
        readonly fragility: "HIGH";
    };
    /**
     * Alternative end-of-results marker — the "No more results" text container.
     */
    readonly noMoreResultsText: {
        readonly selector: "div[role=\"feed\"] p.fontBodyMedium";
        readonly description: "No-more-results / end-of-list paragraph";
        readonly fragility: "HIGH";
    };
    /** Outer wrapper of the business detail panel */
    readonly detailPanel: {
        readonly selector: "div[role=\"main\"]";
        readonly description: "Business detail panel root";
        readonly fragility: "LOW";
    };
    /** Business name heading in the detail panel */
    readonly businessName: {
        readonly selector: "h1.DUwDvf";
        readonly description: "Business name heading in detail panel";
        readonly fragility: "HIGH";
    };
    /**
     * Rating value — e.g. "4.5"
     * The aria-label on the star widget contains the full string "4.5 stars".
     */
    readonly ratingAriaLabel: {
        readonly selector: "div[role=\"img\"][aria-label*=\"stars\"]";
        readonly description: "Star rating widget with aria-label containing the numeric rating";
        readonly fragility: "MEDIUM";
    };
    /** Review count element — e.g. "(123)" */
    readonly reviewCount: {
        readonly selector: "span[aria-label*=\"reviews\"]";
        readonly description: "Review count with aria-label";
        readonly fragility: "MEDIUM";
    };
    /** Address row in the detail panel info section */
    readonly addressRow: {
        readonly selector: "button[data-item-id=\"address\"]";
        readonly description: "Address button in detail info section";
        readonly fragility: "LOW";
    };
    /** Phone number row */
    readonly phoneRow: {
        readonly selector: "button[data-item-id^=\"phone:tel:\"]";
        readonly description: "Phone number button with data-item-id starting phone:tel:";
        readonly fragility: "LOW";
    };
    /** Website row */
    readonly websiteRow: {
        readonly selector: "a[data-item-id=\"authority\"]";
        readonly description: "Website link with data-item-id=authority";
        readonly fragility: "LOW";
    };
    /** Category label (e.g. "Plumber", "Plumbing supply store") */
    readonly categoryLabel: {
        readonly selector: "button[jsaction*=\"category\"]";
        readonly description: "Category label button in detail header";
        readonly fragility: "MEDIUM";
    };
    /**
     * Hours section toggle button.
     * Expanding reveals the full weekly hours table.
     */
    readonly hoursToggle: {
        readonly selector: "div[aria-label*=\"hours\"] > div[role=\"button\"]";
        readonly description: "Opening hours toggle button";
        readonly fragility: "MEDIUM";
    };
    /** Individual hour row after the toggle is expanded */
    readonly hourRow: {
        readonly selector: "tr.y0skZc";
        readonly description: "Hour row in expanded hours table";
        readonly fragility: "HIGH";
    };
    /** Price level indicator (e.g. "€€") */
    readonly priceLevel: {
        readonly selector: "span[aria-label*=\"Price\"]";
        readonly description: "Price level span with aria-label";
        readonly fragility: "MEDIUM";
    };
    /**
     * CAPTCHA / consent screen indicators.
     * If any of these are visible, the session is challenged.
     */
    readonly captchaFrame: {
        readonly selector: "iframe[src*=\"recaptcha\"], iframe[title*=\"reCAPTCHA\"]";
        readonly description: "reCAPTCHA iframe — session is being challenged";
        readonly fragility: "LOW";
    };
    readonly consentDialog: {
        readonly selector: "div[aria-modal=\"true\"] button[aria-label*=\"Accept\"]";
        readonly description: "Cookie consent dialog accept button";
        readonly fragility: "MEDIUM";
    };
    /** "Something went wrong" error overlay */
    readonly errorOverlay: {
        readonly selector: "div.M19K8b";
        readonly description: "Google Maps error overlay";
        readonly fragility: "HIGH";
    };
};
export type SelectorKey = keyof typeof SELECTORS;
/** Helper: extract just the selector string by key. */
export declare function sel(key: SelectorKey): string;
//# sourceMappingURL=selectors.d.ts.map