/**
 * tests/unit/deduplicator/FingerprintDeduplicator.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FingerprintDeduplicator } from "../../../src/deduplicator/FingerprintDeduplicator.js";
import { isOk, isErr } from "../../../src/core/types/common.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type {
  BusinessID,
  RunID,
  QueryID,
  Fingerprint,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeRecord(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  idCounter++;
  const fp = `fp-${idCounter}` as Fingerprint;
  return {
    id: `biz-${idCounter}` as BusinessID,
    fingerprint: fp,
    externalIds: {},
    name: `Business ${idCounter}`,
    normalizedName: `business ${idCounter}`,
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
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    services: null,
    normalizationStatus: "complete",
    deduplicationStatus: "pending",
    exportStatus: "pending",
    ...overrides,
  };
}

function makeRecordWithFp(fp: string): BusinessRecord {
  return makeRecord({ fingerprint: fp as Fingerprint });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — construction", () => {
  it("starts with size=0 when no initial fingerprints", () => {
    const d = new FingerprintDeduplicator();
    expect(d.size).toBe(0);
  });

  it("accepts pre-seeded fingerprints", () => {
    const initial = new Map([
      ["fp-a", "fp-a"],
      ["fp-b", "fp-b"],
    ]);
    const d = new FingerprintDeduplicator({ initialFingerprints: initial });
    expect(d.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// classify — unique path
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — unique records", () => {
  let dedup: FingerprintDeduplicator;

  beforeEach(() => {
    dedup = new FingerprintDeduplicator();
  });

  it("classifies a new record as 'unique'", async () => {
    const r = await dedup.classify(makeRecord());
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.verdict).toBe("unique");
      expect(r.value.canonicalFingerprint).toBeUndefined();
    }
  });

  it("increments size after first classification", async () => {
    await dedup.classify(makeRecord());
    expect(dedup.size).toBe(1);
  });

  it("classifies multiple distinct records as unique independently", async () => {
    const r1 = await dedup.classify(makeRecordWithFp("fp-x"));
    const r2 = await dedup.classify(makeRecordWithFp("fp-y"));
    const r3 = await dedup.classify(makeRecordWithFp("fp-z"));
    expect(isOk(r1) && r1.value.verdict).toBe("unique");
    expect(isOk(r2) && r2.value.verdict).toBe("unique");
    expect(isOk(r3) && r3.value.verdict).toBe("unique");
    expect(dedup.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// classify — duplicate path
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — duplicate records", () => {
  let dedup: FingerprintDeduplicator;

  beforeEach(() => {
    dedup = new FingerprintDeduplicator();
  });

  it("classifies the same fingerprint a second time as 'duplicate'", async () => {
    const fp = "fp-shared";
    await dedup.classify(makeRecordWithFp(fp));
    const r2 = await dedup.classify(makeRecordWithFp(fp));
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) {
      expect(r2.value.verdict).toBe("duplicate");
      expect(r2.value.canonicalFingerprint).toBe(fp);
    }
  });

  it("size does not grow after duplicate", async () => {
    const fp = "fp-dupe";
    await dedup.classify(makeRecordWithFp(fp));
    await dedup.classify(makeRecordWithFp(fp));
    await dedup.classify(makeRecordWithFp(fp));
    expect(dedup.size).toBe(1);
  });

  it("correctly identifies duplicates among many unique records", async () => {
    for (let i = 0; i < 10; i++) {
      await dedup.classify(makeRecordWithFp(`fp-${i}`));
    }
    const r = await dedup.classify(makeRecordWithFp("fp-5"));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.verdict).toBe("duplicate");
  });

  it("carries canonicalFingerprint from original insertion", async () => {
    const fp = "fp-original";
    await dedup.classify(makeRecordWithFp(fp));
    const r = await dedup.classify(makeRecordWithFp(fp));
    if (isOk(r)) {
      expect(r.value.canonicalFingerprint).toBe(fp);
    }
  });
});

// ---------------------------------------------------------------------------
// classify — pre-seeded duplicates
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — pre-seeded store", () => {
  it("treats pre-seeded fingerprints as duplicates immediately", async () => {
    const initial = new Map([["fp-known", "fp-known"]]);
    const dedup = new FingerprintDeduplicator({ initialFingerprints: initial });

    const r = await dedup.classify(makeRecordWithFp("fp-known"));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.verdict).toBe("duplicate");
      expect(r.value.canonicalFingerprint).toBe("fp-known");
    }
  });

  it("treats unseen fingerprints as unique even with a seeded store", async () => {
    const initial = new Map([["fp-known", "fp-known"]]);
    const dedup = new FingerprintDeduplicator({ initialFingerprints: initial });

    const r = await dedup.classify(makeRecordWithFp("fp-new"));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.verdict).toBe("unique");
  });
});

// ---------------------------------------------------------------------------
// classify — error path
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — invalid records", () => {
  it("returns err when fingerprint is empty string", async () => {
    const dedup = new FingerprintDeduplicator();
    const record = makeRecordWithFp("");
    const r = await dedup.classify(record);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_RECORD");
  });
});

// ---------------------------------------------------------------------------
// forget / clear / snapshot
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — forget() and clear()", () => {
  let dedup: FingerprintDeduplicator;

  beforeEach(() => {
    dedup = new FingerprintDeduplicator();
  });

  it("forget() removes a fingerprint so next classify is 'unique' again", async () => {
    const fp = "fp-remove-me";
    await dedup.classify(makeRecordWithFp(fp));
    dedup.forget(fp);
    const r = await dedup.classify(makeRecordWithFp(fp));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.verdict).toBe("unique");
  });

  it("forget() does not throw for unknown fingerprint", () => {
    expect(() => {
      dedup.forget("not-there");
    }).not.toThrow();
  });

  it("clear() resets size to 0", async () => {
    await dedup.classify(makeRecord());
    await dedup.classify(makeRecord());
    dedup.clear();
    expect(dedup.size).toBe(0);
  });

  it("after clear(), previously seen fingerprints are treated as new", async () => {
    const fp = "fp-cleared";
    await dedup.classify(makeRecordWithFp(fp));
    dedup.clear();
    const r = await dedup.classify(makeRecordWithFp(fp));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.verdict).toBe("unique");
  });
});

describe("FingerprintDeduplicator — snapshot()", () => {
  it("returns a copy of the current store", async () => {
    const dedup = new FingerprintDeduplicator();
    await dedup.classify(makeRecordWithFp("fp-snap-1"));
    await dedup.classify(makeRecordWithFp("fp-snap-2"));

    const snap = dedup.snapshot();
    expect(snap.size).toBe(2);
    expect(snap.get("fp-snap-1")).toBe("fp-snap-1");
  });

  it("mutations to snapshot do not affect internal store", async () => {
    const dedup = new FingerprintDeduplicator();
    await dedup.classify(makeRecordWithFp("fp-a"));

    const snap = dedup.snapshot() as Map<string, string>;
    snap.set("fp-injected", "fp-injected");

    expect(dedup.size).toBe(1); // internal store unchanged
  });
});

// ---------------------------------------------------------------------------
// Stress
// ---------------------------------------------------------------------------

describe("FingerprintDeduplicator — stress", () => {
  it("correctly processes 1000 records with 500 duplicates", async () => {
    const dedup = new FingerprintDeduplicator();
    let uniqueCount = 0;
    let dupeCount = 0;

    // First 500: unique
    for (let i = 0; i < 500; i++) {
      const r = await dedup.classify(makeRecordWithFp(`fp-stress-${i}`));
      if (isOk(r) && r.value.verdict === "unique") uniqueCount++;
    }
    // Next 500: duplicates of the first 500
    for (let i = 0; i < 500; i++) {
      const r = await dedup.classify(makeRecordWithFp(`fp-stress-${i}`));
      if (isOk(r) && r.value.verdict === "duplicate") dupeCount++;
    }

    expect(uniqueCount).toBe(500);
    expect(dupeCount).toBe(500);
    expect(dedup.size).toBe(500);
  });
});
