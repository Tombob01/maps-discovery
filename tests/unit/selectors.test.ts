/**
 * selectors.test.ts
 * Tests the SELECTORS registry shape and the sel() helper function.
 * No Playwright or browser needed — pure data structure tests.
 */

import { describe, it, expect } from "vitest";

import { SELECTORS, sel } from "../../src/providers/google-maps/selectors.js";

describe("SELECTORS registry", () => {
  it("exports a non-empty object", () => {
    expect(Object.keys(SELECTORS).length).toBeGreaterThan(0);
  });

  it("every entry has a non-empty selector string", () => {
    for (const [key, entry] of Object.entries(SELECTORS)) {
      expect(typeof entry.selector).toBe("string");
      expect(entry.selector.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty description", () => {
    for (const [key, entry] of Object.entries(SELECTORS)) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has a valid fragility level", () => {
    const valid = new Set(["LOW", "MEDIUM", "HIGH"]);
    for (const [key, entry] of Object.entries(SELECTORS)) {
      void key; // referenced for loop variable only
      expect(valid.has(entry.fragility)).toBe(true);
    }
  });

  it("all selector strings are unique (no duplicate selectors)", () => {
    const selectors = Object.values(SELECTORS).map((e) => e.selector);
    const unique = new Set(selectors);
    expect(unique.size).toBe(selectors.length);
  });

  it("all keys are unique (trivially, but documents the expectation)", () => {
    const keys = Object.keys(SELECTORS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains the critical scraping selectors", () => {
    const required = [
      "searchInput",
      "resultsSidebar",
      "resultItem",
      "resultItemLink",
      "detailPanel",
      "businessName",
      "addressRow",
      "phoneRow",
      "websiteRow",
      "captchaFrame",
      "endOfResultsSentinel",
    ] as const;
    for (const key of required) {
      expect(SELECTORS[key]).toBeDefined();
    }
  });

  it("captchaFrame selector is LOW fragility (semantic attribute)", () => {
    expect(SELECTORS.captchaFrame.fragility).toBe("LOW");
  });

  it("resultsSidebar uses role attribute (LOW fragility)", () => {
    expect(SELECTORS.resultsSidebar.fragility).toBe("LOW");
    expect(SELECTORS.resultsSidebar.selector).toContain('[role="feed"]');
  });

  it("phoneRow uses data-item-id attribute (LOW fragility)", () => {
    expect(SELECTORS.phoneRow.fragility).toBe("LOW");
    expect(SELECTORS.phoneRow.selector).toContain("data-item-id");
  });
});

describe("sel() helper", () => {
  it("returns the selector string for a known key", () => {
    expect(sel("searchInput")).toBe(SELECTORS.searchInput.selector);
    expect(sel("resultsSidebar")).toBe(SELECTORS.resultsSidebar.selector);
    expect(sel("captchaFrame")).toBe(SELECTORS.captchaFrame.selector);
  });

  it("returns a non-empty string for every registered key", () => {
    for (const key of Object.keys(SELECTORS) as (keyof typeof SELECTORS)[]) {
      const s = sel(key);
      expect(typeof s).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("sel() output matches SELECTORS[key].selector exactly", () => {
    for (const key of Object.keys(SELECTORS) as (keyof typeof SELECTORS)[]) {
      expect(sel(key)).toBe(SELECTORS[key].selector);
    }
  });
});
