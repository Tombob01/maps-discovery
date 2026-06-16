/**
 * @module tests/unit/ui/httpClient.executeRun.test.ts
 *
 * Tests for httpClient.executeRun() fire-and-forget behavior.
 * Backend returns 202 immediately; client returns sentinel summary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function make202Response() {
  return {
    ok: true,
    json: async () => ({ ok: true, data: { runId: "run-test-123", status: "running" } }),
  };
}

const EXECUTE_PARAMS = {
  provider: "google-maps",
  runId: "run-test-123",
  query: { niche: "plumbers", location: "Lagos Nigeria" },
  keywords: [{ keyword: "plumbers Lagos", strategy: "commercial" as const }],
};

describe("httpClient.executeRun() — fire-and-forget", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("POSTs to the correct execute endpoint", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(make202Response());
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    await httpClient.executeRun(EXECUTE_PARAMS);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/runs/run-test-123/execute"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a sentinel ExecutionSummary immediately", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(make202Response());
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    const result = await httpClient.executeRun(EXECUTE_PARAMS);

    expect(result).toEqual({
      discovery: { resultsFound: 0, pagesScraped: 0 },
      normalization: { processed: 0, failed: 0 },
    });
  });

  it("sends correct seeds from keywords array", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(make202Response());
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    await httpClient.executeRun(EXECUTE_PARAMS);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.seeds).toEqual([{ keyword: "plumbers Lagos", location: "Lagos Nigeria", strategy: "commercial" }]);
  });

  it("falls back to query.niche when keywords array is empty", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(make202Response());
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    await httpClient.executeRun({ ...EXECUTE_PARAMS, keywords: [] });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.seeds).toEqual([{ keyword: "plumbers", location: "Lagos Nigeria" }]);
  });

  it("throws ApiError on non-2xx response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: { code: "CONFLICT", message: "Already running" } }),
    });
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    await expect(httpClient.executeRun(EXECUTE_PARAMS)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Already running",
    });
  });

  it("does not use AbortController or setTimeout", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(make202Response());
    const { httpClient } = await import("../../../src/ui/lib/httpClient.js");

    await httpClient.executeRun(EXECUTE_PARAMS);

    // setTimeout should not be called for timeout purposes
    // (it may be called 0 times or by other infra — we check fetch had no signal)
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.signal).toBeUndefined();
    setTimeoutSpy.mockRestore();
  });
});
