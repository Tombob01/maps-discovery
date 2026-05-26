/**
 * tests/unit/pipeline/pipeline.test.ts
 *
 * Covers: PipelineRunner (drain mode) and NormalizationStage.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PipelineRunner } from "../../../src/pipeline/PipelineRunner.js";
import { NormalizationStage } from "../../../src/pipeline/NormalizationStage.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import { isOk, isErr } from "../../../src/core/types/common.js";
import type {
  NormalizationJobPayload,
  StageResult,
} from "../../../src/core/models/Job.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type {
  IPipelineStage,
  StageContext,
} from "../../../src/pipeline/IPipelineStage.js";
import type {
  Result,
  RunID,
  QueryID,
  UUID,
} from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeProviderResult(rawPayload: unknown = {}): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: "ChIJ-abc",
    rawPayload,
    sourceUrl: null,
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as RunID,
    queryId: "q-1" as QueryID,
    resumeToken: {
      strategy: "offset",
      pageRequest: { kind: "offset", page: 1, pageSize: 20 },
      createdAt: Date.now(),
    },
  };
}

function makeJobPayload(rawResultId = "raw-1"): NormalizationJobPayload {
  return {
    runId: "run-1" as RunID,
    queryId: "q-1" as QueryID,
    rawResultId: rawResultId as UUID,
    providerId: "google-maps",
  };
}

const goodPayload = {
  name: "Ace Plumbers",
  city: "Lagos",
  country: "Nigeria",
  address: "1 Marina, Lagos",
};

// ---------------------------------------------------------------------------
// PipelineRunner — drain mode
// ---------------------------------------------------------------------------

describe("PipelineRunner — drain()", () => {
  it("processes all queued jobs and updates stats", async () => {
    const queue = new InMemoryQueue<{ task: string }>("test");

    const stage: IPipelineStage<{ task: string }> = {
      stageName: "normalization",
      async execute(): Promise<Result<StageResult, never>> {
        return isOk({ ok: true, value: { success: true } })
          ? { ok: true, value: { success: true } }
          : { ok: true, value: { success: true } };
      },
    };

    await queue.enqueue({ task: "a" });
    await queue.enqueue({ task: "b" });
    await queue.enqueue({ task: "c" });

    const runner = new PipelineRunner(queue, stage);
    await runner.drain();

    expect(runner.stats.processed).toBe(3);
    expect(runner.stats.succeeded).toBe(3);
    expect(runner.stats.failed).toBe(0);

    const d = await queue.depth();
    expect(isOk(d) && d.value).toBe(0);
  });

  it("counts skipped jobs correctly", async () => {
    const queue = new InMemoryQueue<{ task: string }>("skip-q");

    const stage: IPipelineStage<{ task: string }> = {
      stageName: "normalization",
      async execute(): Promise<Result<StageResult, never>> {
        return {
          ok: true,
          value: { success: true, skipped: true, skipReason: "test" },
        };
      },
    };

    await queue.enqueue({ task: "x" });
    const runner = new PipelineRunner(queue, stage);
    await runner.drain();

    expect(runner.stats.skipped).toBe(1);
    expect(runner.stats.succeeded).toBe(0);
  });

  it("nacks and counts failed jobs on stage error", async () => {
    const queue = new InMemoryQueue<{ task: string }>("fail-q", {
      defaultMaxAttempts: 1,
    });

    const stage: IPipelineStage<{ task: string }> = {
      stageName: "normalization",
      async execute(
        _p,
        _c,
      ): Promise<
        Result<
          StageResult,
          { code: "UNEXPECTED_ERROR"; stage: "normalization"; message: string }
        >
      > {
        return {
          ok: false,
          error: {
            code: "UNEXPECTED_ERROR",
            stage: "normalization",
            message: "boom",
          },
        };
      },
    };

    await queue.enqueue({ task: "bad" });
    const runner = new PipelineRunner(queue, stage);
    await runner.drain();

    expect(runner.stats.failed).toBe(1);
  });

  it("handles an empty queue without error", async () => {
    const queue = new InMemoryQueue<{ task: string }>("empty-q");
    const stage: IPipelineStage<{ task: string }> = {
      stageName: "normalization",
      async execute(): Promise<Result<StageResult, never>> {
        return { ok: true, value: { success: true } };
      },
    };
    const runner = new PipelineRunner(queue, stage);
    await runner.drain();
    expect(runner.stats.processed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NormalizationStage
// ---------------------------------------------------------------------------

describe("NormalizationStage — execute()", () => {
  const mapper = new GoogleMapsProviderMapper();
  const normalizer = new BusinessNormalizer([mapper]);

  const ctx: StageContext = { runId: "run-1", stageId: "job-1", attempt: 1 };

  it("returns success for a valid raw result", async () => {
    const rawStore = new Map<string, ProviderResult>();
    rawStore.set("raw-1", makeProviderResult(goodPayload));

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
    });

    const r = await stage.execute(makeJobPayload("raw-1"), ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.success).toBe(true);
      expect(r.value.skipped).toBeFalsy();
    }
  });

  it("skips gracefully when rawResultId not found", async () => {
    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async () => null,
    });
    const r = await stage.execute(makeJobPayload("missing"), ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.skipped).toBe(true);
      expect(r.value.skipReason).toMatch(/not found/);
    }
  });

  it("skips when normalization fails (bad payload)", async () => {
    const rawStore = new Map<string, ProviderResult>();
    rawStore.set("raw-bad", makeProviderResult({ rating: 4.5 })); // no name

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
    });

    const r = await stage.execute(makeJobPayload("raw-bad"), ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.skipped).toBe(true);
  });

  it("returns Err when fetchRawResult throws", async () => {
    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async () => {
        throw new Error("DB down");
      },
    });
    const r = await stage.execute(makeJobPayload("raw-1"), ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(r.error.message).toContain("DB down");
    }
  });

  it("calls onSuccess callback with the normalized record", async () => {
    const rawStore = new Map<string, ProviderResult>();
    rawStore.set("raw-cb", makeProviderResult(goodPayload));

    const received: BusinessRecord[] = [];

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
      onSuccess: async (record) => {
        received.push(record);
      },
    });

    await stage.execute(makeJobPayload("raw-cb"), ctx);

    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe("Ace Plumbers");
  });

  it("returns Err when onSuccess throws", async () => {
    const rawStore = new Map<string, ProviderResult>();
    rawStore.set("raw-err", makeProviderResult(goodPayload));

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
      onSuccess: async () => {
        throw new Error("persist failed");
      },
    });

    const r = await stage.execute(makeJobPayload("raw-err"), ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("stage name is 'normalization'", () => {
    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async () => null,
    });
    expect(stage.stageName).toBe("normalization");
  });
});

// ---------------------------------------------------------------------------
// PipelineRunner + NormalizationStage integration
// ---------------------------------------------------------------------------

describe("PipelineRunner + NormalizationStage — integration", () => {
  it("drain processes normalization jobs end-to-end", async () => {
    const queue = new InMemoryQueue<NormalizationJobPayload>("normalization");
    const mapper = new GoogleMapsProviderMapper();
    const normalizer = new BusinessNormalizer([mapper]);
    const rawStore = new Map<string, ProviderResult>();

    rawStore.set("raw-1", makeProviderResult(goodPayload));
    rawStore.set(
      "raw-2",
      makeProviderResult({ ...goodPayload, name: "Best Electricians" }),
    );

    const saved: BusinessRecord[] = [];

    const stage = new NormalizationStage(normalizer, {
      fetchRawResult: async (id) => rawStore.get(id) ?? null,
      onSuccess: async (record) => {
        saved.push(record);
      },
    });

    await queue.enqueue(makeJobPayload("raw-1"));
    await queue.enqueue(makeJobPayload("raw-2"));

    const runner = new PipelineRunner(queue, stage);
    await runner.drain();

    expect(runner.stats.processed).toBe(2);
    expect(runner.stats.succeeded).toBe(2);
    expect(saved).toHaveLength(2);
    expect(saved.map((r) => r.name).sort()).toEqual([
      "Ace Plumbers",
      "Best Electricians",
    ]);
  });
});
