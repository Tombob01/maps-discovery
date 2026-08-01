/**
 * tests/unit/api/RunService.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RunService } from "../../../src/api/RunService.js";
import { JsonLinesExporter } from "../../../src/exporters/JsonLinesExporter.js";
import { CsvExporter } from "../../../src/exporters/CsvExporter.js";
import type { IRunStore, IRecordStore } from "../../../src/api/RunService.js";
import type { Run } from "../../../src/core/models/Job.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { RecordListRequest } from "../../../src/api/types.js";
import type {
  BusinessID,
  RunID,
  QueryID,
  Fingerprint,
  E164Phone,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// In-memory store implementations
// ---------------------------------------------------------------------------

class InMemoryRunStore implements IRunStore {
  private readonly store = new Map<string, Run>();
  async create(run: Run) {
    this.store.set(run.id as string, run);
  }
  async findById(id: string) {
    return this.store.get(id) ?? null;
  }
  async list() {
    return [...this.store.values()];
  }
}

class InMemoryRecordStore implements IRecordStore {
  private readonly records: BusinessRecord[] = [];

  seed(records: BusinessRecord[]) {
    this.records.push(...records);
  }

  async findByRunId(runId: string) {
    return this.records.filter((r) => (r.runId as string) === runId);
  }

  async list(req: RecordListRequest) {
    let items = [...this.records];
    if (req.runId)
      items = items.filter((r) => (r.runId as string) === req.runId);
    if (req.deduplicationStatus)
      items = items.filter(
        (r) => r.deduplicationStatus === req.deduplicationStatus,
      );
    if (req.normalizationStatus)
      items = items.filter(
        (r) => r.normalizationStatus === req.normalizationStatus,
      );
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: items.length };
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: "biz-1" as BusinessID,
    fingerprint: "fp-1" as Fingerprint,
    externalIds: {},
    name: "Ace Plumbers",
    normalizedName: "ace plumbers",
    address: {
      raw: "Lagos",
      street: null,
      city: "Lagos",
      state: null,
      postalCode: null,
      country: "Nigeria",
      countryCode: "NG",
    },
    geo: null,
    phone: null,
    normalizedPhone: null,
    website: null,
    categories: Object.freeze([]),
    primaryCategory: null,
    rating: null,
    reviewCount: null,
    hours: null,
    priceLevel: null,
    sourceProvider: "google-maps",
    sourceUrl: null,
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-abc" as RunID,
    queryId: "q-1" as QueryID,
    normalizationStatus: "complete",
    deduplicationStatus: "unique",
    services: null,
    exportStatus: "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let runStore: InMemoryRunStore;
let recordStore: InMemoryRecordStore;
let exportStore: Map<string, string>;
let service: RunService;

beforeEach(() => {
  runStore = new InMemoryRunStore();
  recordStore = new InMemoryRecordStore();
  exportStore = new Map();

  const writeAdapter = async (dest: string, content: string) => {
    exportStore.set(dest, content);
  };

  service = new RunService(
    runStore,
    recordStore,
    new Map<string, import("../../../src/exporters/IExporter.js").IExporter>([
      ["jsonl", new JsonLinesExporter(writeAdapter)],
      ["csv", new CsvExporter(writeAdapter)],
    ]),
  );
});

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

describe("RunService — createRun()", () => {
  it("creates a run and returns a summary", async () => {
    const r = await service.createRun({
      niche: "plumbers",
      location: "Lagos, Nigeria",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.niche).toBe("plumbers");
      expect(r.data.location).toBe("Lagos, Nigeria");
      expect(r.data.status).toBe("pending");
      expect(typeof r.data.id).toBe("string");
    }
  });

  it("returns validation error when niche is empty", async () => {
    const r = await service.createRun({ niche: "", location: "Lagos" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation error when location is empty", async () => {
    const r = await service.createRun({ niche: "plumbers", location: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_ERROR");
  });

  it("persists the run so getRun finds it", async () => {
    const created = await service.createRun({
      niche: "electricians",
      location: "Abuja",
    });
    if (!created.ok) throw new Error("createRun failed");
    const fetched = await service.getRun(created.data.id);
    expect(fetched.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRun
// ---------------------------------------------------------------------------

describe("RunService — getRun()", () => {
  it("returns NOT_FOUND for unknown id", async () => {
    const r = await service.getRun("nonexistent-id");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("returns the correct run summary", async () => {
    const created = await service.createRun({
      niche: "plumbers",
      location: "Lagos",
    });
    if (!created.ok) throw new Error("createRun failed");
    const r = await service.getRun(created.data.id);
    if (r.ok) {
      expect(r.data.niche).toBe("plumbers");
      expect(r.data.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

// ---------------------------------------------------------------------------
// listRuns
// ---------------------------------------------------------------------------

describe("RunService — listRuns()", () => {
  it("returns empty array when no runs", async () => {
    const r = await service.listRuns();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(0);
  });

  it("returns all created runs", async () => {
    await service.createRun({ niche: "plumbers", location: "Lagos" });
    await service.createRun({ niche: "electricians", location: "Abuja" });
    const r = await service.listRuns();
    expect(r.ok && r.data).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// listRecords
// ---------------------------------------------------------------------------

describe("RunService — listRecords()", () => {
  beforeEach(() => {
    recordStore.seed([
      makeRecord({ id: "biz-1" as BusinessID }),
      makeRecord({
        id: "biz-2" as BusinessID,
        deduplicationStatus: "duplicate",
      }),
      makeRecord({ id: "biz-3" as BusinessID }),
    ]);
  });

  it("returns paginated records", async () => {
    const r = await service.listRecords({ page: 1, pageSize: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.items).toHaveLength(2);
      expect(r.data.total).toBe(3);
      expect(r.data.hasMore).toBe(true);
      expect(r.data.page).toBe(1);
      expect(r.data.pageSize).toBe(2);
    }
  });

  it("page 2 returns remaining records", async () => {
    const r = await service.listRecords({ page: 2, pageSize: 2 });
    expect(r.ok && r.data.items).toHaveLength(1);
    if (r.ok) expect(r.data.hasMore).toBe(false);
  });

  it("filters by deduplicationStatus", async () => {
    const r = await service.listRecords({ deduplicationStatus: "duplicate" });
    expect(r.ok && r.data.items).toHaveLength(1);
  });

  it("record summary has expected fields", async () => {
    const r = await service.listRecords({ pageSize: 1 });
    if (r.ok && r.data.items[0]) {
      const s = r.data.items[0];
      expect(typeof s.id).toBe("string");
      expect(s.name).toBe("Ace Plumbers");
      expect(s.normalizationStatus).toBe("complete");
    }
  });
});

// ---------------------------------------------------------------------------
// exportRun
// ---------------------------------------------------------------------------

describe("RunService — exportRun()", () => {
  beforeEach(() => {
    recordStore.seed([makeRecord({ runId: "run-abc" as RunID })]);
  });

  it("exports to jsonl successfully", async () => {
    const r = await service.exportRun({
      runId: "run-abc",
      format: "jsonl",
      destination: "/tmp/out.jsonl",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.recordsExported).toBe(1);
      expect(r.data.format).toBe("jsonl");
    }
    expect(exportStore.has("/tmp/out.jsonl")).toBe(true);
  });

  it("exports to csv successfully", async () => {
    const r = await service.exportRun({
      runId: "run-abc",
      format: "csv",
      destination: "/tmp/out.csv",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.format).toBe("csv");
  });

  it("returns UNSUPPORTED_FORMAT for unknown format", async () => {
    const r = await service.exportRun({
      runId: "run-abc",
      format: "xml" as "csv",
      destination: "/tmp/out.xml",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("returns NO_RECORDS when runId has no records", async () => {
    const r = await service.exportRun({
      runId: "empty-run",
      format: "jsonl",
      destination: "/tmp/out.jsonl",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_RECORDS");
  });

  it("returns VALIDATION_ERROR when runId is empty", async () => {
    const r = await service.exportRun({
      runId: "",
      format: "jsonl",
      destination: "/tmp/out.jsonl",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_ERROR");
  });

  it("written file contains record data", async () => {
    await service.exportRun({
      runId: "run-abc",
      format: "jsonl",
      destination: "/tmp/data.jsonl",
    });
    const content = exportStore.get("/tmp/data.jsonl") ?? "";
    expect(content).toContain("Ace Plumbers");
  });
});
