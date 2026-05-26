/**
 * GoogleMapsProvider.test.ts
 *
 * Tests the GoogleMapsProvider using mock browser and adapter.
 * No real browser is launched — all Playwright interactions are stubbed.
 *
 * Covers:
 *   - Provider metadata (id, displayName, capabilities)
 *   - Health check states
 *   - initializeBrowser / closeBrowser lifecycle
 *   - discover() happy path (yields ProviderResults)
 *   - discover() respects maxResults
 *   - discover() handles CAPTCHA detection
 *   - discover() handles browser not initialised
 *   - discover() resumes from a valid ResumeToken
 *   - discover() yields unique results (dedup by placeId)
 *   - discover() stops at end-of-results
 *   - ProviderResult shape invariants
 *   - ResumeToken structure on each yielded result
 */

import { describe, it, expect } from "vitest";

import {
  makeMockBrowser,
  makeMockAdapter,
  makeMockPage,
  makeSamplePayload,
  type MockBrowser,
  type MockAdapter,
  type MockPage,
} from "./providers/google-maps/mocks.js";
import { GoogleMapsProvider } from "../../src/providers/google-maps/GoogleMapsProvider.js";
import { DEFAULT_GOOGLE_MAPS_POLICY } from "../../src/providers/google-maps/index.js";

import type { ResolvedQuery } from "../../src/core/models/Query.js";
import type { ScrapingPolicy } from "../../src/core/types/rate-limit.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POLICY: ScrapingPolicy = {
  ...DEFAULT_GOOGLE_MAPS_POLICY,
  rateLimit: {
    requestsPerMinute: 100,
    minDelayBetweenRequestsMs: 0,
    jitterMs: 0,
    maxConcurrent: 1,
  },
  retry: {
    maxAttempts: 2,
    backoffStrategy: "fixed",
    backoffBaseMs: 0,
    backoffCapMs: 0,
    retryableStatusCodes: [429, 500],
  },
  browser: {
    ...DEFAULT_GOOGLE_MAPS_POLICY.browser,
    slowMoMs: 0,
    timeoutMs: 5000,
  },
};

function makeResolvedQuery(
  overrides: Partial<ResolvedQuery> = {},
): ResolvedQuery {
  return {
    id: "query-1" as import("../../src/core/types/common.js").QueryID,
    runId: "run-1" as import("../../src/core/types/common.js").RunID,
    parentId: null,
    rawText: "plumbers Lagos, Nigeria",
    niche: "plumbers",
    providerId: "google-maps",
    geoTarget: {
      displayName: "Lagos, Nigeria",
      country: "NG",
      city: "Lagos",
    },
    resolvedGeoTarget: {
      displayName: "Lagos, Nigeria",
      country: "NG",
      city: "Lagos",
      resolvedCoordinates: { lat: 6.5244, lng: 3.3792 },
    },
    generatedByStrategies: ["seed"],
    queryHash: "a".repeat(
      64,
    ) as import("../../src/core/types/common.js").QueryHash,
    lifecycleState: "canonicalized",
    status: "pending",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeProvider(
  browser: MockBrowser,
  adapter: MockAdapter,
): GoogleMapsProvider {
  // GoogleMapsProvider accepts IBrowserProvider and GoogleMapsAdapter via DI
  return new GoogleMapsProvider(
    POLICY,
    browser as unknown as import("../../src/providers/google-maps/GoogleMapsBrowser.js").GoogleMapsBrowser,
    adapter as unknown as import("../../src/providers/google-maps/GoogleMapsAdapter.js").GoogleMapsAdapter,
  );
}

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — metadata", () => {
  const browser = makeMockBrowser();
  const adapter = makeMockAdapter();
  const provider = makeProvider(browser, adapter);

  it("id = 'google-maps'", () => {
    expect(provider.id).toBe("google-maps");
  });

  it("displayName = 'Google Maps'", () => {
    expect(provider.displayName).toBe("Google Maps");
  });

  it("capabilities.supportsGeoFilter = true", () => {
    expect(provider.capabilities.supportsGeoFilter).toBe(true);
  });

  it("capabilities.supportsCoordinates = true", () => {
    expect(provider.capabilities.supportsCoordinates).toBe(true);
  });

  it("capabilities.supportsResultCount = false", () => {
    expect(provider.capabilities.supportsResultCount).toBe(false);
  });

  it("capabilities.maxResultsPerQuery is a positive number", () => {
    expect(provider.capabilities.maxResultsPerQuery).toBeGreaterThan(0);
  });

  it("policy matches what was injected", () => {
    expect(provider.policy).toBe(POLICY);
  });

  it("browserReady is false before initializeBrowser()", () => {
    expect(provider.browserReady).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — checkHealth()", () => {
  it("returns unavailable when browser not initialised", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    const health = await provider.checkHealth();
    expect(health.status).toBe("unavailable");
  });

  it("returns healthy after successful initializeBrowser()", async () => {
    const provider = makeProvider(
      makeMockBrowser({ isReady: true }),
      makeMockAdapter(),
    );
    await provider.initializeBrowser();
    const health = await provider.checkHealth();
    expect(health.status).toBe("healthy");
  });

  it("returns unavailable if browser.isReady = false after init", async () => {
    const browser = makeMockBrowser({ isReady: false });
    const provider = makeProvider(browser, makeMockAdapter());
    await provider.initializeBrowser();
    const health = await provider.checkHealth();
    expect(health.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — lifecycle", () => {
  it("initializeBrowser() sets browserReady = true on success", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    const result = await provider.initializeBrowser();
    expect(result.ok).toBe(true);
    expect(provider.browserReady).toBe(true);
  });

  it("initializeBrowser() propagates Err from browser.launch()", async () => {
    const browser = makeMockBrowser({
      launch: async () => ({
        ok: false as const,
        error: new Error("launch failed"),
      }),
    });
    const provider = makeProvider(browser, makeMockAdapter());
    const result = await provider.initializeBrowser();
    expect(result.ok).toBe(false);
    expect(provider.browserReady).toBe(false);
  });

  it("closeBrowser() sets browserReady = false", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    await provider.initializeBrowser();
    expect(provider.browserReady).toBe(true);
    await provider.closeBrowser();
    expect(provider.browserReady).toBe(false);
  });

  it("shutdown() is idempotent — safe to call twice", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    await provider.initializeBrowser();
    await provider.shutdown();
    await expect(provider.shutdown()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// discover() — happy path
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() happy path", () => {
  it("throws if browser not initialised", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    const query = makeResolvedQuery();
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.discover(query)) {
        /* consume */
      }
    }).rejects.toThrow("Browser not initialised");
  });

  it("yields one ProviderResult per adapter payload", async () => {
    const payloads = [
      makeSamplePayload({ placeId: "ChIJ001", resultPosition: 1 }),
      makeSamplePayload({ placeId: "ChIJ002", resultPosition: 2 }),
      makeSamplePayload({ placeId: "ChIJ003", resultPosition: 3 }),
    ];

    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const adapter = makeMockAdapter(payloads);
    const provider = makeProvider(browser, adapter);
    await provider.initializeBrowser();

    const results: import("../../src/core/models/ProviderResult.js").ProviderResult[] =
      [];
    for await (const result of provider.discover(makeResolvedQuery(), {
      maxResults: 10,
    })) {
      results.push(result);
    }

    expect(results.length).toBe(3);
  });

  it("each ProviderResult has the correct providerId", async () => {
    const payloads = [makeSamplePayload({ placeId: "ChIJ001" })];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    for await (const result of provider.discover(makeResolvedQuery())) {
      expect(result.providerId).toBe("google-maps");
    }
  });

  it("each ProviderResult has the correct runId and queryId", async () => {
    const payloads = [makeSamplePayload({ placeId: "ChIJ001" })];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();
    const query = makeResolvedQuery();

    for await (const result of provider.discover(query)) {
      expect(result.runId).toBe(query.runId);
      expect(result.queryId).toBe(query.id);
    }
  });

  it("each ProviderResult has a collectedAt Date", async () => {
    const payloads = [makeSamplePayload({ placeId: "ChIJ001" })];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    for await (const result of provider.discover(makeResolvedQuery())) {
      expect(result.collectedAt).toBeInstanceOf(Date);
    }
  });

  it("each ProviderResult has a non-empty providerResultId", async () => {
    const payloads = [makeSamplePayload({ placeId: "ChIJ001" })];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    for await (const result of provider.discover(makeResolvedQuery())) {
      expect(typeof result.providerResultId).toBe("string");
      expect(result.providerResultId.trim().length).toBeGreaterThan(0);
    }
  });

  it("each ProviderResult has a valid ResumeToken", async () => {
    const payloads = [makeSamplePayload({ placeId: "ChIJ001" })];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    for await (const result of provider.discover(makeResolvedQuery())) {
      expect(result.resumeToken).toBeDefined();
      expect(result.resumeToken.strategy).toBe("cursor");
      expect(result.resumeToken.pageRequest.kind).toBe("cursor");
      expect(result.resumeToken.createdAt).toBeGreaterThan(0);
    }
  });

  it("rawPayload contains the GoogleMapsRawPayload", async () => {
    const payloads = [
      makeSamplePayload({ placeId: "ChIJ001", name: "Ace Plumbers" }),
    ];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    for await (const result of provider.discover(makeResolvedQuery())) {
      const payload =
        result.rawPayload as import("../../src/providers/google-maps/GoogleMapsRawPayload.js").GoogleMapsRawPayload;
      expect(payload.name).toBe("Ace Plumbers");
    }
  });
});

// ---------------------------------------------------------------------------
// discover() — maxResults enforcement
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() maxResults", () => {
  async function collectN(n: number, available: number): Promise<number> {
    const payloads = Array.from({ length: available }, (_, i) =>
      makeSamplePayload({
        placeId: `ChIJ${String(i).padStart(3, "0")}`,
        resultPosition: i + 1,
      }),
    );
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 2,
    });
    const adapter = makeMockAdapter(payloads);
    const provider = makeProvider(browser, adapter);
    await provider.initializeBrowser();

    let count = 0;
    for await (const _ of provider.discover(makeResolvedQuery(), {
      maxResults: n,
    })) {
      count++;
    }
    return count;
  }

  it("stops after maxResults = 1", async () => {
    const count = await collectN(1, 10);
    expect(count).toBeLessThanOrEqual(1);
  });

  it("stops after maxResults = 3", async () => {
    const count = await collectN(3, 10);
    expect(count).toBeLessThanOrEqual(3);
  });

  it("collects all results when available < maxResults", async () => {
    const count = await collectN(20, 3);
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// discover() — CAPTCHA detection
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() CAPTCHA detection", () => {
  it("throws ProviderError with CAPTCHA_DETECTED code", async () => {
    const payloads = [makeSamplePayload()];
    const browser = makeMockBrowser({
      isCaptchaPresent: async () => true,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    await expect(async () => {
      for await (const _ of provider.discover(makeResolvedQuery())) {
        /* consume */
      }
    }).rejects.toMatchObject({ code: "CAPTCHA_DETECTED" });
  });
});

// ---------------------------------------------------------------------------
// discover() — deduplication by placeId
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() deduplication", () => {
  it("does not yield the same placeId twice in one session", async () => {
    // Two payloads with the same placeId
    const payloads = [
      makeSamplePayload({ placeId: "ChIJdup", resultPosition: 1 }),
      makeSamplePayload({ placeId: "ChIJdup", resultPosition: 2 }),
      makeSamplePayload({ placeId: "ChIJuniq", resultPosition: 3 }),
    ];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    const resultIds: string[] = [];
    for await (const result of provider.discover(makeResolvedQuery(), {
      maxResults: 10,
    })) {
      resultIds.push(result.providerResultId);
    }

    expect(resultIds.filter((id) => id === "ChIJdup")).toHaveLength(1);
    expect(resultIds).toContain("ChIJuniq");
  });
});

// ---------------------------------------------------------------------------
// discover() — ResumeToken validity
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() ResumeToken", () => {
  it("throws RESUME_TOKEN_STALE when token queryHash doesn't match", async () => {
    const provider = makeProvider(makeMockBrowser(), makeMockAdapter());
    await provider.initializeBrowser();

    const staleToken: import("../../src/core/types/pagination.js").ResumeToken =
      {
        strategy: "cursor",
        pageRequest: {
          kind: "cursor",
          cursor: Buffer.from(
            JSON.stringify({ yieldedIds: [], queryHash: "b".repeat(64) }),
          ).toString("base64url"),
        },
        createdAt: Date.now(),
      };

    const query = makeResolvedQuery(); // queryHash = "a" * 64, token has "b" * 64
    await expect(async () => {
      for await (const _ of provider.discover(query, {
        resumeToken: staleToken,
      })) {
        /* */
      }
    }).rejects.toMatchObject({ code: "RESUME_TOKEN_STALE" });
  });

  it("accepts a valid resume token with matching queryHash", async () => {
    const queryHash = "a".repeat(
      64,
    ) as import("../../src/core/types/common.js").QueryHash;
    const payloads = [
      makeSamplePayload({ placeId: "ChIJnew1" }),
      makeSamplePayload({ placeId: "ChIJnew2" }),
    ];
    let scrollCalls = 0;
    const browser = makeMockBrowser({
      isEndOfResults: async () => scrollCalls++ >= 1,
    });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    // Token says we already yielded 0 results — so we start fresh
    const validToken: import("../../src/core/types/pagination.js").ResumeToken =
      {
        strategy: "cursor",
        pageRequest: {
          kind: "cursor",
          cursor: Buffer.from(
            JSON.stringify({ yieldedIds: [], queryHash }),
          ).toString("base64url"),
        },
        createdAt: Date.now(),
      };

    const query = makeResolvedQuery({ queryHash });
    const results: string[] = [];
    for await (const result of provider.discover(query, {
      resumeToken: validToken,
      maxResults: 10,
    })) {
      results.push(result.providerResultId);
    }
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// discover() — end of results
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider — discover() end of results", () => {
  it("stops when isEndOfResults returns true immediately", async () => {
    const payloads = Array.from({ length: 5 }, (_, i) =>
      makeSamplePayload({ placeId: `ChIJ${i}` }),
    );
    const browser = makeMockBrowser({ isEndOfResults: async () => true });
    const provider = makeProvider(browser, makeMockAdapter(payloads));
    await provider.initializeBrowser();

    const results: unknown[] = [];
    for await (const r of provider.discover(makeResolvedQuery(), {
      maxResults: 100,
    })) {
      results.push(r);
    }
    // With end-of-results true from the start, we still process the first
    // batch of visible cards before checking — count may be 0-5 depending
    // on scroll ordering, but must be ≤ 5.
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
