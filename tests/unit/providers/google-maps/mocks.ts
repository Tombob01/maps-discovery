/**
 * @module tests/unit/providers/google-maps/mocks
 *
 * Mock implementations of Playwright Page, ElementHandle, and internal
 * components for unit testing the Google Maps provider without a real browser.
 *
 * Design:
 *   - All mocks are plain objects with controllable behaviour
 *   - Default behaviour: happy path (results exist, no CAPTCHA, no timeout)
 *   - Tests override specific methods to test error paths
 *   - No real network calls, no real browser process
 */

import type { GoogleMapsAdapter } from "../../../../src/providers/google-maps/GoogleMapsAdapter.js";
import type { GoogleMapsBrowser } from "../../../../src/providers/google-maps/GoogleMapsBrowser.js";
import type { GoogleMapsRawPayload } from "../../../../src/providers/google-maps/GoogleMapsRawPayload.js";
import type { ElementHandle, Page } from "playwright";

// ---------------------------------------------------------------------------
// Mock ElementHandle
// ---------------------------------------------------------------------------

export interface MockElementHandle {
  click: () => Promise<void>;
  textContent: () => Promise<string | null>;
  getAttribute: (name: string) => Promise<string | null>;
  $: (selector: string) => Promise<MockElementHandle | null>;
  $$: (selector: string) => Promise<MockElementHandle[]>;
  evaluate: (fn: (el: Element) => unknown) => Promise<unknown>;
}

export function makeMockElementHandle(
  overrides: Partial<MockElementHandle> = {},
): MockElementHandle {
  return {
    click: overrides.click ?? (async () => {}),
    textContent: overrides.textContent ?? (async () => "Mock Business"),
    getAttribute: overrides.getAttribute ?? (async () => null),
    $: overrides.$ ?? (async () => null),
    $$: overrides.$$ ?? (async () => []),
    evaluate: overrides.evaluate ?? (async () => null),
  };
}

// ---------------------------------------------------------------------------
// Mock Page
// ---------------------------------------------------------------------------

export interface MockPage {
  goto: (url: string, opts?: unknown) => Promise<void>;
  waitForSelector: (
    sel: string,
    opts?: unknown,
  ) => Promise<MockElementHandle | null>;
  $: (sel: string) => Promise<MockElementHandle | null>;
  $$: (sel: string) => Promise<MockElementHandle[]>;
  url: () => string;
  evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>;
  addInitScript: (fn: unknown) => Promise<void>;
  close: () => Promise<void>;
  goBack: (opts?: unknown) => Promise<void>;
  setDefaultTimeout: (ms: number) => void;
  setDefaultNavigationTimeout: (ms: number) => void;
}

export function makeMockPage(overrides: Partial<MockPage> = {}): MockPage {
  const currentUrl = "https://www.google.com/maps/search/plumbers+Lagos";
  return {
    goto: overrides.goto ?? (async () => {}),
    waitForSelector:
      overrides.waitForSelector ?? (async () => makeMockElementHandle()),
    $: overrides.$ ?? (async () => null),
    $$: overrides.$$ ?? (async () => []),
    url: overrides.url ?? (() => currentUrl),
    evaluate: overrides.evaluate ?? (async () => undefined),
    addInitScript: overrides.addInitScript ?? (async () => {}),
    close: overrides.close ?? (async () => {}),
    goBack: overrides.goBack ?? (async () => {}),
    setDefaultTimeout: overrides.setDefaultTimeout ?? (() => {}),
    setDefaultNavigationTimeout:
      overrides.setDefaultNavigationTimeout ?? (() => {}),
  };
}

// ---------------------------------------------------------------------------
// Mock GoogleMapsBrowser
// ---------------------------------------------------------------------------

export interface MockBrowser {
  launch: () => Promise<
    { ok: true; value: void } | { ok: false; error: Error }
  >;
  shutdown: () => Promise<void>;
  isReady: boolean;
  newPage: () => Promise<
    { ok: true; value: MockPage } | { ok: false; error: Error }
  >;
  navigateToSearch: (
    page: MockPage,
    query: string,
  ) => Promise<{ ok: true; value: void } | { ok: false; error: Error }>;
  scrollResultsSidebar: (page: MockPage) => Promise<void>;
  isCaptchaPresent: (page: MockPage) => Promise<boolean>;
  isEndOfResults: (page: MockPage) => Promise<boolean>;
}

export function makeMockBrowser(
  overrides: Partial<MockBrowser> = {},
): MockBrowser {
  return {
    launch:
      overrides.launch ??
      (async () => ({ ok: true as const, value: undefined })),
    shutdown: overrides.shutdown ?? (async () => {}),
    isReady: overrides.isReady ?? true,
    newPage:
      overrides.newPage ??
      (async () => ({ ok: true as const, value: makeMockPage() })),
    navigateToSearch:
      overrides.navigateToSearch ??
      (async () => ({ ok: true as const, value: undefined })),
    scrollResultsSidebar: overrides.scrollResultsSidebar ?? (async () => {}),
    isCaptchaPresent: overrides.isCaptchaPresent ?? (async () => false),
    isEndOfResults: overrides.isEndOfResults ?? (async () => false),
  };
}

// ---------------------------------------------------------------------------
// Mock GoogleMapsAdapter
// ---------------------------------------------------------------------------

export interface MockAdapter {
  getResultCards: (page: MockPage) => Promise<MockElementHandle[]>;
  getCardListingUrl: (card: MockElementHandle) => Promise<string | undefined>;
  extractFromCard: (
    page: MockPage,
    card: MockElementHandle,
    query: string,
    pos: number) => Promise<GoogleMapsRawPayload>;
  extractFromDetailUrl: (
    page: MockPage,
    url: string,
    searchQuery: string,
    position: number,
  ) => Promise<GoogleMapsRawPayload>;
}

export function makeMockAdapter(
  payloads: GoogleMapsRawPayload[] = [],
  overrides: Partial<MockAdapter> = {},
): MockAdapter {
  let callCount = 0;
  let hrefCallCount = 0;
  return {
    getResultCards:
      overrides.getResultCards ??
      (async (page) => {
        // Return one element-handle stub per payload
        return payloads.map(() => makeMockElementHandle());
      }),
    getCardListingUrl:
      overrides.getCardListingUrl ??
      (async () => {
        const p = payloads[hrefCallCount++];
        const pid = p?.placeId ?? "ChIJabc";
        return "https://www.google.com/maps/place/Business/@1.0,2.0,17z/data=!19s" + pid;
      }),
    extractFromDetailUrl:
      overrides.extractFromDetailUrl ??
      (async (_page, url, searchQuery, position) => {
        // Match payload by placeId extracted from URL, fall back to callCount
        const pidMatch = url.match(/!(?:19s|1s)(ChIJ[^!?&]+)/);
        const pid = pidMatch?.[1];
        const payload = (pid ? payloads.find(p => p.placeId === pid) : undefined)
          ?? payloads[callCount]
          ?? { searchQuery, resultPosition: position, detailPanelScraped: true };
        callCount++;
        return payload;
      }),
    extractFromCard:
      overrides.extractFromCard ??
      (async (_page, _card, query, pos) => {
        const payload = payloads[callCount] ?? {
          searchQuery: query,
          resultPosition: pos,
        };
        callCount++;
        return payload;
      }),
  };
}

// ---------------------------------------------------------------------------
// Sample payloads for tests
// ---------------------------------------------------------------------------

export function makeSamplePayload(
  overrides: Partial<GoogleMapsRawPayload> = {},
): GoogleMapsRawPayload {
  const base: GoogleMapsRawPayload = {
    placeId: "ChIJtest123",
    listingUrl:
      "https://www.google.com/maps/place/Ace+Plumbers/@6.5244,3.3792,17z/data=!1sChIJtest123",
    name: "Ace Plumbers Ltd",
    address: "14 Broad Street, Lagos Island, Lagos",
    phone: "+2348012345678",
    website: "https://aceplumbers.ng",
    ratingText: "4.5 stars",
    reviewCountText: "123 reviews",
    categoryText: "Plumber",
    searchQuery: "plumbers Lagos, Nigeria",
    resultPosition: 1,
    detailPanelScraped: true,
  };
  const result: GoogleMapsRawPayload = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      (result as Record<string, unknown>)[k] = v;
    }
  }
  return result;
}
