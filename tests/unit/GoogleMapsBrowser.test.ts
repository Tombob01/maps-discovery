/**
 * GoogleMapsBrowser.test.ts
 * Tests the pure helper functions exported from GoogleMapsBrowser.
 * Browser lifecycle is not tested here (requires Playwright installation).
 */

import { describe, it, expect, vi } from "vitest";

import {
  humanDelay,
  withRetry,
} from "../../src/providers/google-maps/GoogleMapsBrowser.js";

// ---------------------------------------------------------------------------
// humanDelay
// ---------------------------------------------------------------------------

describe("humanDelay()", () => {
  it("resolves without throwing", async () => {
    // Use very short delays so tests stay fast
    await expect(humanDelay(0, 1)).resolves.toBeUndefined();
  });

  it("accepts equal min and max (deterministic delay)", async () => {
    await expect(humanDelay(0, 0)).resolves.toBeUndefined();
  });

  it("resolves in approximately the requested time range", async () => {
    const min = 10;
    const max = 20;
    const start = Date.now();
    await humanDelay(min, max);
    const elapsed = Date.now() - start;
    // Allow generous tolerance for scheduler jitter
    expect(elapsed).toBeGreaterThanOrEqual(min - 5);
    expect(elapsed).toBeLessThan(max + 100);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry()", () => {
  it("returns result immediately on first success", async () => {
    const op = vi.fn(async () => "success");
    const result = await withRetry(op, 3, 0, 100, "test");
    expect(result).toBe("success");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries after failure and succeeds on second attempt", async () => {
    let calls = 0;
    const op = async (): Promise<string> => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "success";
    };
    const result = await withRetry(op, 3, 0, 100, "test");
    expect(result).toBe("success");
    expect(calls).toBe(2);
  });

  it("retries up to maxAttempts then throws", async () => {
    const op = vi.fn(async () => {
      throw new Error("always fails");
    });
    await expect(withRetry(op, 3, 0, 100, "test")).rejects.toThrow(
      "always fails",
    );
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("re-throws the last error (not the first)", async () => {
    let calls = 0;
    const op = async (): Promise<never> => {
      calls++;
      throw new Error(`error ${calls}`);
    };
    await expect(withRetry(op, 3, 0, 100, "test")).rejects.toThrow("error 3");
  });

  it("succeeds with maxAttempts = 1 on first try", async () => {
    const op = async (): Promise<number> => 42;
    expect(await withRetry(op, 1, 0, 100, "test")).toBe(42);
  });

  it("throws immediately with maxAttempts = 1 on failure", async () => {
    const op = async (): Promise<never> => {
      throw new Error("fail");
    };
    await expect(withRetry(op, 1, 0, 100, "test")).rejects.toThrow("fail");
  });

  it("works with async operations that return complex objects", async () => {
    const expected = { ok: true, data: [1, 2, 3] };
    const op = async () => expected;
    const result = await withRetry(op, 2, 0, 100, "test");
    expect(result).toBe(expected);
  });
});
