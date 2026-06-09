/**
 * @module tests/unit/api/server.export
 * Tests for GET /api/runs/:id/export
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "../../../src/api/server.js";
import type { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";

function makeFacade(overrides: Partial<RuntimeFacade> = {}): RuntimeFacade {
  return {
    expandKeyword: vi.fn(),
    createRun: vi.fn(),
    executeRun: vi.fn(),
    executeFromSeed: vi.fn(),
    getRun: vi.fn(),
    listRecords: vi.fn(),
    exportRun: vi.fn(),
    ...overrides,
  } as unknown as RuntimeFacade;
}

describe("GET /api/runs/:id/export", () => {
  let facade: RuntimeFacade;

  beforeEach(() => {
    facade = makeFacade();
  });

  it("returns CSV with correct headers", async () => {
    vi.mocked(facade.exportRun).mockResolvedValue({
      content: "id,name\n1,Test\n",
      recordsExported: 1,
      filename: "run-abc.csv",
    });

    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export?format=csv");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("run-abc.csv");
    expect(await res.text()).toContain("id,name");
  });

  it("returns JSONL with correct headers", async () => {
    vi.mocked(facade.exportRun).mockResolvedValue({
      content: '{"id":"1","name":"Test"}\n',
      recordsExported: 1,
      filename: "run-abc.jsonl",
    });

    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export?format=jsonl");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(res.headers.get("Content-Disposition")).toContain("run-abc.jsonl");
  });

  it("defaults to csv when format is omitted", async () => {
    vi.mocked(facade.exportRun).mockResolvedValue({
      content: "id,name\n",
      recordsExported: 0,
      filename: "run-abc.csv",
    });

    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export");

    expect(res.status).toBe(200);
    expect(facade.exportRun).toHaveBeenCalledWith("abc", "csv");
  });

  it("returns 400 for unknown format", async () => {
    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export?format=xml");

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when NO_RECORDS error thrown", async () => {
    vi.mocked(facade.exportRun).mockRejectedValue(
      new Error("NO_RECORDS: No records found for run \"abc\""),
    );

    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export?format=csv");

    expect(res.status).toBe(404);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("NO_RECORDS");
  });

  it("returns 500 on unexpected export error", async () => {
    vi.mocked(facade.exportRun).mockRejectedValue(new Error("disk full"));

    const app = createServer(facade);
    const res = await app.request("/api/runs/abc/export?format=csv");

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("EXPORT_FAILED");
  });
});
