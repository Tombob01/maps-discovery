/**
 * tests/unit/exporters/exporters.test.ts
 *
 * Covers: JsonLinesExporter and CsvExporter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { JsonLinesExporter } from "../../../src/exporters/JsonLinesExporter.js";
import { CsvExporter } from "../../../src/exporters/CsvExporter.js";
import { isOk, isErr } from "../../../src/core/types/common.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type {
  BusinessID,
  RunID,
  QueryID,
  Fingerprint,
  E164Phone,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: "biz-1" as BusinessID,
    fingerprint: "fp-abc123" as Fingerprint,
    externalIds: { googlePlaceId: "ChIJabc" },
    name: "Ace Plumbers",
    normalizedName: "ace plumbers",
    address: {
      raw: "1 Marina, Lagos, Nigeria",
      street: "1 Marina",
      city: "Lagos",
      state: "Lagos",
      postalCode: "100001",
      country: "Nigeria",
      countryCode: "NG",
    },
    geo: { lat: 6.5244, lng: 3.3792 },
    phone: "+234 801 234 5678",
    normalizedPhone: "+2348012345678" as E164Phone,
    website: "https://aceplumbers.ng",
    categories: Object.freeze(["plumbing", "home-services"]),
    primaryCategory: "plumbing",
    rating: 4.5,
    reviewCount: 123,
    hours: null,
    priceLevel: 2,
    sourceProvider: "google-maps",
    sourceUrl: "https://maps.google.com/place/123",
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    services: null,
    normalizationStatus: "complete",
    deduplicationStatus: "unique",
    exportStatus: "pending",
    ...overrides,
  };
}

// In-memory write adapter
function makeMemoryWriter(): {
  write: (dest: string, content: string) => Promise<void>;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    write: async (dest, content) => {
      store.set(dest, content);
    },
  };
}

// ---------------------------------------------------------------------------
// JsonLinesExporter
// ---------------------------------------------------------------------------

describe("JsonLinesExporter", () => {
  let writer: ReturnType<typeof makeMemoryWriter>;
  let exporter: JsonLinesExporter;

  beforeEach(() => {
    writer = makeMemoryWriter();
    exporter = new JsonLinesExporter(writer.write);
  });

  it("format is 'jsonl'", () => {
    expect(exporter.format).toBe("jsonl");
  });

  it("exports one record successfully", async () => {
    const r = await exporter.export([makeRecord()], "/tmp/out.jsonl");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.recordsWritten).toBe(1);
      expect(r.value.destination).toBe("/tmp/out.jsonl");
      expect(r.value.format).toBe("jsonl");
    }
  });

  it("writes valid JSON on each line", async () => {
    await exporter.export(
      [makeRecord(), makeRecord({ name: "Best Elec" })],
      "/tmp/out.jsonl",
    );
    const content = writer.store.get("/tmp/out.jsonl") ?? "";
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("serialised record has expected fields", async () => {
    await exporter.export([makeRecord()], "/tmp/out.jsonl");
    const content = writer.store.get("/tmp/out.jsonl") ?? "";
    const parsed = JSON.parse(content.trim().split("\n")[0]!);
    expect(parsed.name).toBe("Ace Plumbers");
    expect(parsed.city).toBe("Lagos");
    expect(parsed.normalizedPhone).toBe("+2348012345678");
    expect(parsed.googlePlaceId).toBe("ChIJabc");
    expect(parsed.collectedAt).toBe("2024-01-15T10:00:00.000Z");
  });

  it("flattens geo into lat/lng", async () => {
    await exporter.export([makeRecord()], "/tmp/out.jsonl");
    const content = writer.store.get("/tmp/out.jsonl") ?? "";
    const parsed = JSON.parse(content.trim().split("\n")[0]!);
    expect(parsed.lat).toBe(6.5244);
    expect(parsed.lng).toBe(3.3792);
  });

  it("includes services as null when not set", async () => {
    await exporter.export([makeRecord()], "/tmp/out.jsonl");
    const content = writer.store.get("/tmp/out.jsonl") ?? "";
    const parsed = JSON.parse(content.trim().split("\n")[0]!);
    expect(parsed.services).toBeNull();
  });

  it("includes services array when present", async () => {
    const record = makeRecord({ services: Object.freeze(["Drain cleaning", "Leak detection"]) });
    await exporter.export([record], "/tmp/out.jsonl");
    const content = writer.store.get("/tmp/out.jsonl") ?? "";
    const parsed = JSON.parse(content.trim().split("\n")[0]!);
    expect(parsed.services).toEqual(["Drain cleaning", "Leak detection"]);
  });

  it("handles null geo (lat/lng null)", async () => {
    await exporter.export([makeRecord({ geo: null })], "/tmp/out.jsonl");
    const parsed = JSON.parse(
      (writer.store.get("/tmp/out.jsonl") ?? "").trim(),
    );
    expect(parsed.lat).toBeNull();
    expect(parsed.lng).toBeNull();
  });

  it("returns EMPTY_BATCH err for zero records", async () => {
    const r = await exporter.export([], "/tmp/out.jsonl");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("EMPTY_BATCH");
  });

  it("returns INVALID_DESTINATION err for empty destination", async () => {
    const r = await exporter.export([makeRecord()], "");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_DESTINATION");
  });

  it("returns WRITE_FAILED err when write throws", async () => {
    const badExporter = new JsonLinesExporter(async () => {
      throw new Error("disk full");
    });
    const r = await badExporter.export([makeRecord()], "/tmp/out.jsonl");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("WRITE_FAILED");
      expect(r.error.message).toContain("disk full");
    }
  });

  it("exports multiple records — recordsWritten matches", async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ name: `Biz ${i}` }),
    );
    const r = await exporter.export(records, "/tmp/out.jsonl");
    expect(isOk(r) && r.value.recordsWritten).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// CsvExporter
// ---------------------------------------------------------------------------

describe("CsvExporter", () => {
  let writer: ReturnType<typeof makeMemoryWriter>;
  let exporter: CsvExporter;

  beforeEach(() => {
    writer = makeMemoryWriter();
    exporter = new CsvExporter(writer.write);
  });

  it("format is 'csv'", () => {
    expect(exporter.format).toBe("csv");
  });

  it("exports one record successfully", async () => {
    const r = await exporter.export([makeRecord()], "/tmp/out.csv");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.recordsWritten).toBe(1);
  });

  it("first line is the header row", async () => {
    await exporter.export([makeRecord()], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    const header = content.split("\n")[0] ?? "";
    expect(header).toContain("id");
    expect(header).toContain("name");
    expect(header).toContain("normalized_phone");
    expect(header).toContain("google_place_id");
  });

  it("data row contains record values", async () => {
    await exporter.export([makeRecord()], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    const dataRow = content.split("\n")[1] ?? "";
    expect(dataRow).toContain("Ace Plumbers");
    expect(dataRow).toContain("Lagos");
    expect(dataRow).toContain("+2348012345678");
  });

  it("escapes commas inside fields with double-quotes", async () => {
    const record = makeRecord({ name: "Smith, Jones & Co" });
    await exporter.export([record], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    expect(content).toContain('"Smith, Jones & Co"');
  });

  it("escapes double-quotes inside fields", async () => {
    const record = makeRecord({ name: `He said "hello"` });
    await exporter.export([record], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    expect(content).toContain(`"He said ""hello"""`);
  });

  it("returns EMPTY_BATCH err for zero records", async () => {
    const r = await exporter.export([], "/tmp/out.csv");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("EMPTY_BATCH");
  });

  it("returns INVALID_DESTINATION err for empty destination", async () => {
    const r = await exporter.export([makeRecord()], "  ");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_DESTINATION");
  });

  it("returns WRITE_FAILED err when write throws", async () => {
    const bad = new CsvExporter(async () => {
      throw new Error("no space");
    });
    const r = await bad.export([makeRecord()], "/tmp/out.csv");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("WRITE_FAILED");
  });

  it("exports N records — N+1 lines (header + rows)", async () => {
    const records = Array.from({ length: 4 }, (_, i) =>
      makeRecord({ name: `Biz ${i}` }),
    );
    await exporter.export(records, "/tmp/multi.csv");
    const content = writer.store.get("/tmp/multi.csv") ?? "";
    // header + 4 data rows + trailing newline = split gives 6 entries
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(5); // 1 header + 4 data
  });

  it("includes services column in header", async () => {
    await exporter.export([makeRecord()], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    const header = content.split("\n")[0] ?? "";
    expect(header).toContain("services");
  });

  it("services column is empty when null", async () => {
    await exporter.export([makeRecord({ services: null })], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    const dataRow = content.split("\n")[1] ?? "";
    const fields = dataRow.split(",");
    expect(fields[fields.length - 1]?.trim()).toBe("");
  });

  it("services column joins values with pipe separator", async () => {
    const record = makeRecord({ services: Object.freeze(["Drain cleaning", "Leak detection"]) });
    await exporter.export([record], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    expect(content).toContain("Drain cleaning|Leak detection");
  });

  it("joins multiple categories with pipe separator", async () => {
    await exporter.export([makeRecord()], "/tmp/out.csv");
    const content = writer.store.get("/tmp/out.csv") ?? "";
    expect(content).toContain("plumbing|home-services");
  });
});
