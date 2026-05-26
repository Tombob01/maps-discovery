/**
 * GoogleMapsAdapter.test.ts
 *
 * Unit tests for GoogleMapsAdapter extraction logic.
 * Uses mock Page and ElementHandle � no real browser launched.
 *
 * Covers:
 *   - getResultCards returns array of element handles
 *   - getCardListingUrl extracts href from link element
 *   - extractFromCard falls back to card-only on click failure
 *   - extractFromCard returns detailPanelScraped = true on success
 *   - extractFromCard returns detailPanelScraped = false on fallback
 *   - extractFromCard handles missing detail panel gracefully
 *   - placeId extracted from listing URL
 *   - coordinates extracted from listing URL
 *   - empty payload returned when all fields absent
 */

import { describe, it, expect } from "vitest";

import { GoogleMapsAdapter } from "../../src/providers/google-maps/GoogleMapsAdapter.js";
import {
  makeMockPage,
  makeMockElementHandle,
} from "./providers/google-maps/mocks.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): GoogleMapsAdapter {
  return new GoogleMapsAdapter();
}

const PLACE_URL =
  "https://www.google.com/maps/place/Ace+Plumbers/@6.5244,3.3792,17z/data=!1sChIJtest456";

// ---------------------------------------------------------------------------
// getResultCards
// ---------------------------------------------------------------------------

describe("GoogleMapsAdapter.getResultCards()", () => {
  it("returns empty array when page.$$ throws", async () => {
    const page = makeMockPage({
      $$: async () => {
        throw new Error("page error");
      },
    });
    const adapter = makeAdapter();
    const cards = await adapter.getResultCards(page as never);
    expect(cards).toEqual([]);
  });

  it("returns elements from page.$$", async () => {
    const handles = [makeMockElementHandle(), makeMockElementHandle()];
    const page = makeMockPage({
      $$: async () => handles,
    });
    const adapter = makeAdapter();
    const cards = await adapter.getResultCards(page as never);
    expect(cards).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getCardListingUrl
// ---------------------------------------------------------------------------

describe("GoogleMapsAdapter.getCardListingUrl()", () => {
  it("returns href from resultItemLink element", async () => {
    const link = makeMockElementHandle({
      getAttribute: async (attr) => (attr === "href" ? PLACE_URL : null),
    });
    const card = makeMockElementHandle({
      $: async () => link,
    });
    const adapter = makeAdapter();
    const url = await adapter.getCardListingUrl(card as never);
    expect(url).toBe(PLACE_URL);
  });

  it("returns undefined when no link element found", async () => {
    const card = makeMockElementHandle({ $: async () => null });
    const adapter = makeAdapter();
    const url = await adapter.getCardListingUrl(card as never);
    expect(url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractFromCard � fallback path (click throws)
// ---------------------------------------------------------------------------

describe("GoogleMapsAdapter.extractFromCard() � card-only fallback", () => {
  it("returns detailPanelScraped = false when click fails", async () => {
    const card = makeMockElementHandle({
      click: async () => {
        throw new Error("click failed");
      },
      $: async () =>
        makeMockElementHandle({
          getAttribute: async (attr) => (attr === "href" ? PLACE_URL : null),
        }),
      textContent: async () => "Ace Plumbers",
    });
    const page = makeMockPage();
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      1,
    );
    expect(payload.detailPanelScraped).toBe(false);
  });

  it("extracts placeId from listing URL in fallback path", async () => {
    const card = makeMockElementHandle({
      click: async () => {
        throw new Error("click failed");
      },
      $: async () =>
        makeMockElementHandle({
          getAttribute: async (attr) => (attr === "href" ? PLACE_URL : null),
        }),
    });
    const page = makeMockPage();
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      1,
    );
    expect(payload.placeId).toBe("ChIJtest456");
  });

  it("extracts coordinates from listing URL in fallback path", async () => {
    const card = makeMockElementHandle({
      click: async () => {
        throw new Error("click failed");
      },
      $: async () =>
        makeMockElementHandle({
          getAttribute: async (attr) => (attr === "href" ? PLACE_URL : null),
        }),
    });
    const page = makeMockPage();
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      1,
    );
    expect(payload.coordinates?.lat).toBeCloseTo(6.5244, 3);
    expect(payload.coordinates?.lng).toBeCloseTo(3.3792, 3);
  });

  it("preserves searchQuery and resultPosition in fallback", async () => {
    const card = makeMockElementHandle({
      click: async () => {
        throw new Error("click failed");
      },
      $: async () => null,
    });
    const page = makeMockPage();
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      5,
    );
    expect(payload.searchQuery).toBe("plumbers Lagos");
    expect(payload.resultPosition).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// extractFromCard � detail panel path
// ---------------------------------------------------------------------------

describe("GoogleMapsAdapter.extractFromCard() � detail panel", () => {
  it("returns detailPanelScraped = true when panel opens", async () => {
    const card = makeMockElementHandle({
      click: async () => {},
      $: async () =>
        makeMockElementHandle({
          getAttribute: async (attr) => (attr === "href" ? PLACE_URL : null),
        }),
    });
    const page = makeMockPage({
      waitForSelector: async () => makeMockElementHandle(),
      $: async () => null,
      $$: async () => [],
      url: () => PLACE_URL,
    });
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      1,
    );
    expect(payload.detailPanelScraped).toBe(true);
  });

  it("extracts placeId from current page URL in detail panel path", async () => {
    const card = makeMockElementHandle({
      click: async () => {},
      $: async () => null,
    });
    const page = makeMockPage({
      waitForSelector: async () => makeMockElementHandle(),
      $: async () => null,
      $$: async () => [],
      url: () => PLACE_URL,
    });
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      1,
    );
    expect(payload.placeId).toBe("ChIJtest456");
  });
});

// ---------------------------------------------------------------------------
// Incomplete payload � no identifying fields
// ---------------------------------------------------------------------------

describe("GoogleMapsAdapter.extractFromCard() � empty result", () => {
  it("returns a payload with at least searchQuery when all DOM reads fail", async () => {
    const card = makeMockElementHandle({
      click: async () => {
        throw new Error("click failed");
      },
      $: async () => null,
      textContent: async () => null,
    });
    const page = makeMockPage({ url: () => "https://www.google.com/maps" });
    const adapter = makeAdapter();
    const payload = await adapter.extractFromCard(
      page as never,
      card as never,
      "plumbers Lagos",
      3,
    );
    expect(payload.searchQuery).toBe("plumbers Lagos");
    expect(payload.resultPosition).toBe(3);
    // No identifiers available � placeId, name, phone all undefined
    expect(payload.placeId).toBeUndefined();
    expect(payload.name).toBeUndefined();
  });
});
