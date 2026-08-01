/**
 * Core domain models test suite.
 * Covers: BusinessRecord shape and draft mutability, ProviderResult shape,
 * Job payload shapes, QueueName exhaustiveness, StageResult semantics,
 * StageCheckpoint fields, Run / RunStats structure, and ExternalIdMap.
 *
 * These are structural / contract tests — they verify the shapes
 * can be constructed correctly, fields have the right types, and
 * optional fields behave as documented.
 */

import { describe, it, expect } from "vitest";
import type {
  BusinessRecord,
  BusinessRecordDraft,
  ExternalIdMap,
  DayHours,
  BusinessHours,
} from "../../src/core/models/BusinessRecord.js";
import type {
  QueueName,
  StageName,
  QueryGenerationJobPayload,
  QueryExpansionJobPayload,
  DiscoveryJobPayload,
  NormalizationJobPayload,
  DeduplicationJobPayload,
  ExportJobPayload,
  StageResult,
  StageCheckpoint,
  Run,
  RunStats,
} from "../../src/core/models/Job.js";
import type {
  ProviderResult,
  PersistedRawResult,
} from "../../src/core/models/ProviderResult.js";
import type { DayOfWeek } from "../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Helpers — construct minimal valid instances
// ---------------------------------------------------------------------------

function makeAddress() {
  return {
    raw: "1 Marina, Lagos Island, Lagos, Nigeria",
    street: "1 Marina",
    city: "Lagos",
    state: "Lagos",
    postalCode: null,
    country: "Nigeria",
    countryCode: "NG",
  } as const;
}

function makeBusinessRecord(): BusinessRecord {
  return {
    id: "biz-1" as import("../../src/core/types/common.js").BusinessID,
    fingerprint:
      "fp-abc" as import("../../src/core/types/common.js").Fingerprint,
    externalIds: { googlePlaceId: "ChIJ123" },
    name: "Ace Plumbers Ltd",
    normalizedName: "ace plumbers ltd",
    address: makeAddress(),
    geo: { lat: 6.5244, lng: 3.3792 },
    phone: "+234 801 234 5678",
    normalizedPhone:
      "+2348012345678" as import("../../src/core/types/common.js").E164Phone,
    website: "https://aceplumbers.ng",
    categories: Object.freeze(["plumbing", "home-services"]),
    primaryCategory: "plumbing",
    rating: 4.5,
    reviewCount: 123,
    hours: null,
    priceLevel: 2,
    sourceProvider: "google-maps",
    sourceUrl: "https://maps.google.com/?q=ace+plumbers",
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as import("../../src/core/types/common.js").RunID,
    queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
    services: null,
    normalizationStatus: "complete",
    deduplicationStatus: "unique",
    exportStatus: "pending",
  };
}

function makeProviderResult(): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: "ChIJ123",
    rawPayload: { name: "Ace Plumbers", rating: 4.5 },
    sourceUrl: "https://maps.google.com/place/123",
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as import("../../src/core/types/common.js").RunID,
    queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
    resumeToken: {
      strategy: "offset",
      pageRequest: { kind: "offset", page: 2, pageSize: 20 },
      createdAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// BusinessRecord
// ---------------------------------------------------------------------------

describe("BusinessRecord — required fields", () => {
  it("can be constructed with all required fields", () => {
    const r = makeBusinessRecord();
    expect(r.id).toBe("biz-1");
    expect(r.name).toBe("Ace Plumbers Ltd");
  });

  it("has correct normalization/dedup/export status types", () => {
    const r = makeBusinessRecord();
    expect(["pending", "complete", "failed", "skipped"]).toContain(
      r.normalizationStatus,
    );
    expect(["pending", "unique", "duplicate", "uncertain"]).toContain(
      r.deduplicationStatus,
    );
    expect(["pending", "exported", "excluded"]).toContain(r.exportStatus);
  });

  it("geo field accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), geo: null };
    expect(r.geo).toBeNull();
  });

  it("phone fields accept null", () => {
    const r: BusinessRecord = {
      ...makeBusinessRecord(),
      phone: null,
      normalizedPhone: null,
    };
    expect(r.phone).toBeNull();
    expect(r.normalizedPhone).toBeNull();
  });

  it("website accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), website: null };
    expect(r.website).toBeNull();
  });

  it("primaryCategory accepts null", () => {
    const r: BusinessRecord = {
      ...makeBusinessRecord(),
      primaryCategory: null,
    };
    expect(r.primaryCategory).toBeNull();
  });

  it("rating accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), rating: null };
    expect(r.rating).toBeNull();
  });

  it("reviewCount accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), reviewCount: null };
    expect(r.reviewCount).toBeNull();
  });

  it("hours accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), hours: null };
    expect(r.hours).toBeNull();
  });

  it("priceLevel accepts all valid values (1–4)", () => {
    ([1, 2, 3, 4] as const).forEach((level) => {
      const r: BusinessRecord = { ...makeBusinessRecord(), priceLevel: level };
      expect(r.priceLevel).toBe(level);
    });
  });

  it("priceLevel accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), priceLevel: null };
    expect(r.priceLevel).toBeNull();
  });

  it("sourceUrl accepts null", () => {
    const r: BusinessRecord = { ...makeBusinessRecord(), sourceUrl: null };
    expect(r.sourceUrl).toBeNull();
  });

  it("categories is a ReadonlyArray", () => {
    const r = makeBusinessRecord();
    expect(Array.isArray(r.categories)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BusinessRecordDraft — mutable version
// ---------------------------------------------------------------------------

describe("BusinessRecordDraft — mutability", () => {
  it("draft can mutate status fields (compile-time verified at runtime)", () => {
    const draft: BusinessRecordDraft = { ...makeBusinessRecord() };
    // These assignments would fail TypeScript on BusinessRecord (readonly),
    // but must succeed on BusinessRecordDraft.
    draft.normalizationStatus = "failed";
    draft.deduplicationStatus = "duplicate";
    draft.exportStatus = "exported";
    expect(draft.normalizationStatus).toBe("failed");
    expect(draft.deduplicationStatus).toBe("duplicate");
    expect(draft.exportStatus).toBe("exported");
  });

  it("draft can mutate identity fields", () => {
    const draft: BusinessRecordDraft = { ...makeBusinessRecord() };
    draft.name = "Updated Name";
    draft.normalizedName = "updated name";
    expect(draft.name).toBe("Updated Name");
  });
});

// ---------------------------------------------------------------------------
// ExternalIdMap
// ---------------------------------------------------------------------------

describe("ExternalIdMap", () => {
  it("accepts googlePlaceId", () => {
    const m: ExternalIdMap = { googlePlaceId: "ChIJ456" };
    expect(m.googlePlaceId).toBe("ChIJ456");
  });

  it("accepts yelpId", () => {
    const m: ExternalIdMap = { yelpId: "ace-plumbers-lagos" };
    expect(m.yelpId).toBe("ace-plumbers-lagos");
  });

  it("accepts arbitrary string keys (index signature)", () => {
    const m: ExternalIdMap = { customPlatformId: "xyz-789" };
    expect(m.customPlatformId).toBe("xyz-789");
  });

  it("all known fields are optional", () => {
    const m: ExternalIdMap = {};
    expect(m.googlePlaceId).toBeUndefined();
    expect(m.yelpId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BusinessHours / DayHours
// ---------------------------------------------------------------------------

describe("BusinessHours", () => {
  it("accepts raw strings and null parsed", () => {
    const hours: BusinessHours = {
      raw: Object.freeze(["Mon-Fri: 08:00-17:00"]),
      parsed: null,
    };
    expect(hours.raw).toHaveLength(1);
    expect(hours.parsed).toBeNull();
  });

  it("accepts a parsed DayHours array", () => {
    const day: DayHours = {
      day: "monday",
      open: "09:00",
      close: "17:00",
      isClosed: false,
    };
    const hours: BusinessHours = {
      raw: Object.freeze([]),
      parsed: Object.freeze([day]),
    };
    expect(hours.parsed).toHaveLength(1);
    expect(hours.parsed![0]!.day).toBe("monday");
  });

  it("DayHours accepts null open/close (closed day)", () => {
    const closed: DayHours = {
      day: "sunday",
      open: null,
      close: null,
      isClosed: true,
    };
    expect(closed.isClosed).toBe(true);
    expect(closed.open).toBeNull();
  });

  const days: DayOfWeek[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  it("all 7 DayOfWeek values are valid", () => {
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// ProviderResult
// ---------------------------------------------------------------------------

describe("ProviderResult", () => {
  it("can be constructed with required fields", () => {
    const r = makeProviderResult();
    expect(r.providerId).toBe("google-maps");
    expect(r.providerResultId).toBe("ChIJ123");
  });

  it("rawPayload is typed as unknown (accepts any shape)", () => {
    const r1: ProviderResult = {
      ...makeProviderResult(),
      rawPayload: { nested: { deep: true } },
    };
    const r2: ProviderResult = {
      ...makeProviderResult(),
      rawPayload: "raw string",
    };
    const r3: ProviderResult = {
      ...makeProviderResult(),
      rawPayload: [1, 2, 3],
    };
    expect(r1.rawPayload).toBeDefined();
    expect(r2.rawPayload).toBe("raw string");
    expect(r3.rawPayload).toEqual([1, 2, 3]);
  });

  it("sourceUrl accepts null", () => {
    const r: ProviderResult = { ...makeProviderResult(), sourceUrl: null };
    expect(r.sourceUrl).toBeNull();
  });

  it("resumeToken carries strategy and pageRequest", () => {
    const r = makeProviderResult();
    expect(r.resumeToken.strategy).toBe("offset");
    expect(r.resumeToken.pageRequest.kind).toBe("offset");
  });
});

describe("PersistedRawResult", () => {
  it("extends ProviderResult with id and processed flag", () => {
    const r: PersistedRawResult = {
      ...makeProviderResult(),
      id: "uuid-abc" as import("../../src/core/types/common.js").UUID,
      processed: false,
    };
    expect(r.id).toBe("uuid-abc");
    expect(r.processed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// QueueName exhaustiveness
// ---------------------------------------------------------------------------

describe("QueueName — exhaustiveness", () => {
  const ALL_QUEUE_NAMES: QueueName[] = [
    "query:generate",
    "query:expand",
    "discovery",
    "normalization",
    "deduplication",
    "export",
  ];

  it("has exactly 6 queue names", () => {
    expect(ALL_QUEUE_NAMES).toHaveLength(6);
  });

  it("all queue names are unique", () => {
    expect(new Set(ALL_QUEUE_NAMES).size).toBe(ALL_QUEUE_NAMES.length);
  });

  it("StageName is the same set as QueueName", () => {
    // StageName = QueueName — verified by the type alias, confirmed at runtime
    const stageNames: StageName[] = [...ALL_QUEUE_NAMES];
    expect(stageNames).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Job payload shapes
// ---------------------------------------------------------------------------

describe("Job payload shapes", () => {
  it("QueryGenerationJobPayload has runId and seed", () => {
    const p: QueryGenerationJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      seed: {
        niche: "plumbers",
        location: { displayName: "Lagos, Nigeria", country: "NG" },
      },
    };
    expect(p.runId).toBe("run-1");
    expect(p.seed.niche).toBe("plumbers");
  });

  it("QueryExpansionJobPayload has runId, queryId, providerId, queryHash", () => {
    const p: QueryExpansionJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
      providerId: "google-maps",
      queryHash: "a".repeat(
        64,
      ) as import("../../src/core/types/common.js").QueryHash,
    };
    expect(p.providerId).toBe("google-maps");
    expect(p.queryHash).toHaveLength(64);
  });

  it("DiscoveryJobPayload includes queryHash for idempotency", () => {
    const p: DiscoveryJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
      providerId: "google-maps",
      queryHash: "b".repeat(
        64,
      ) as import("../../src/core/types/common.js").QueryHash,
    };
    expect(p.queryHash).toHaveLength(64);
    expect(p.resumeToken).toBeUndefined();
  });

  it("DiscoveryJobPayload resumeToken is optional", () => {
    const token = {
      strategy: "cursor" as const,
      pageRequest: { kind: "cursor" as const, cursor: "xyz" },
      createdAt: Date.now(),
    };
    const p: DiscoveryJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
      providerId: "google-maps",
      queryHash: "c".repeat(
        64,
      ) as import("../../src/core/types/common.js").QueryHash,
      resumeToken: token,
    };
    expect(p.resumeToken?.strategy).toBe("cursor");
  });

  it("NormalizationJobPayload has rawResultId", () => {
    const p: NormalizationJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      queryId: "query-1" as import("../../src/core/types/common.js").QueryID,
      rawResultId: "raw-uuid" as import("../../src/core/types/common.js").UUID,
      providerId: "google-maps",
    };
    expect(p.rawResultId).toBe("raw-uuid");
  });

  it("DeduplicationJobPayload has businessRecordId", () => {
    const p: DeduplicationJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      businessRecordId:
        "biz-1" as import("../../src/core/types/common.js").BusinessID,
    };
    expect(p.businessRecordId).toBe("biz-1");
  });

  it("ExportJobPayload has format and destination", () => {
    const p: ExportJobPayload = {
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      businessRecordId:
        "biz-1" as import("../../src/core/types/common.js").BusinessID,
      exportFormat: "csv",
      destination: "/exports/out.csv",
    };
    expect(p.exportFormat).toBe("csv");
    expect(p.destination).toBe("/exports/out.csv");
  });

  it("ExportJobPayload exportFormat accepts all valid formats", () => {
    const formats: ExportJobPayload["exportFormat"][] = [
      "csv",
      "json",
      "jsonl",
      "postgres",
    ];
    formats.forEach((fmt) => {
      const p: ExportJobPayload = {
        runId: "run-1" as import("../../src/core/types/common.js").RunID,
        businessRecordId:
          "biz-1" as import("../../src/core/types/common.js").BusinessID,
        exportFormat: fmt,
        destination: "/out",
      };
      expect(p.exportFormat).toBe(fmt);
    });
  });
});

// ---------------------------------------------------------------------------
// StageResult
// ---------------------------------------------------------------------------

describe("StageResult", () => {
  it("minimal success result has success=true", () => {
    const r: StageResult = { success: true };
    expect(r.success).toBe(true);
    expect(r.skipped).toBeUndefined();
    expect(r.outputJobIds).toBeUndefined();
  });

  it("failure result has success=false", () => {
    const r: StageResult = { success: false };
    expect(r.success).toBe(false);
  });

  it("skipped result has skipped=true with skipReason", () => {
    const r: StageResult = {
      success: true,
      skipped: true,
      skipReason: "duplicate query hash",
    };
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe("duplicate query hash");
  });

  it("success result can carry outputJobIds", () => {
    const r: StageResult = {
      success: true,
      outputJobIds: Object.freeze(["job-1", "job-2", "job-3"]),
    };
    expect(r.outputJobIds).toHaveLength(3);
  });

  it("meta field accepts arbitrary diagnostic data", () => {
    const r: StageResult = {
      success: true,
      meta: { durationMs: 42, resultCount: 10 },
    };
    expect((r.meta as { durationMs: number }).durationMs).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// StageCheckpoint
// ---------------------------------------------------------------------------

describe("StageCheckpoint", () => {
  it("required fields are present", () => {
    const cp: StageCheckpoint = {
      id: "uuid-cp" as import("../../src/core/types/common.js").UUID,
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      stage: "discovery",
      entityId: "query-1",
      status: "complete",
      createdAt: new Date("2024-01-15T10:00:00Z"),
    };
    expect(cp.stage).toBe("discovery");
    expect(cp.status).toBe("complete");
  });

  it("error and metadata are optional", () => {
    const cp: StageCheckpoint = {
      id: "uuid-cp" as import("../../src/core/types/common.js").UUID,
      runId: "run-1" as import("../../src/core/types/common.js").RunID,
      stage: "normalization",
      entityId: "raw-result-1",
      status: "failed",
      error: "parse error: missing name field",
      metadata: { attempt: 3 },
      createdAt: new Date(),
    };
    expect(cp.error).toBe("parse error: missing name field");
    expect((cp.metadata as { attempt: number }).attempt).toBe(3);
  });

  it("all StageCheckpointStatus values are valid", () => {
    const statuses: StageCheckpoint["status"][] = [
      "started",
      "complete",
      "failed",
      "skipped",
    ];
    expect(statuses).toHaveLength(4);
    expect(new Set(statuses).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Run / RunStats
// ---------------------------------------------------------------------------

describe("Run and RunStats", () => {
  it("Run has correct shape", () => {
    const run: Run = {
      id: "run-1" as import("../../src/core/types/common.js").RunID,
      status: "running",
      config: {
        runId: "run-1" as import("../../src/core/types/common.js").RunID,
        seeds: [],
        providerIds: ["google-maps"],
        forceReprocess: false,
      },
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      stats: {
        queriesGenerated: 10,
        queriesDispatched: 8,
        rawResultsFound: 200,
        recordsNormalized: 195,
        recordsUnique: 180,
        recordsDuplicate: 15,
        recordsExported: 0,
        errors: 5,
      },
    };
    expect(run.status).toBe("running");
    expect(run.completedAt).toBeNull();
    expect(run.stats.queriesGenerated).toBe(10);
  });

  it("RunStats has all 8 numeric counter fields", () => {
    const stats: RunStats = {
      queriesGenerated: 0,
      queriesDispatched: 0,
      rawResultsFound: 0,
      recordsNormalized: 0,
      recordsUnique: 0,
      recordsDuplicate: 0,
      recordsExported: 0,
      errors: 0,
    };
    expect(Object.keys(stats)).toHaveLength(8);
  });

  it("RunStatus accepts all valid values", () => {
    const statuses: Run["status"][] = [
      "pending",
      "running",
      "paused",
      "complete",
      "failed",
      "cancelled",
    ];
    expect(statuses).toHaveLength(6);
    expect(new Set(statuses).size).toBe(6);
  });
});
