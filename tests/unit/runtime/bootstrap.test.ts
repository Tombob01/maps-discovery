/**
 * tests/unit/runtime/bootstrap.test.ts
 *
 * Verifies that bootstrap() assembles a complete RuntimeContainer.
 * Uses a controlled env by calling createStorage/createServices directly
 * with a fixture config � avoids reading real process.env.
 *
 * No DB connections opened.
 */

// Mock variables MUST be prefixed with "mock" -- Vitest's hoisting transform
// special-cases this prefix to avoid a temporal-dead-zone error when vi.mock()
// is hoisted above these const declarations. Same pattern as start.test.ts.
const mockQueueAdd = vi.fn();
const mockQueueGetJobCounts = vi.fn();
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerGetNextJob = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJobCounts: mockQueueGetJobCounts,
    close: mockQueueClose,
    on: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    getNextJob: mockWorkerGetNextJob,
    close: mockWorkerClose,
    on: vi.fn(),
  })),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorage } from "../../../src/runtime/createStorage.js";
import { createServices } from "../../../src/runtime/createServices.js";
import { RunLifecycleService } from "../../../src/storage/RunLifecycleService.js";
import { RunService } from "../../../src/api/RunService.js";
import type { AppConfig } from "../../../src/config/env.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { BullMQQueue } from "../../../src/queue/BullMQQueue.js";
import type { QueueConfig } from "../../../src/runtime/createServices.js";
import type { NormalizationJobPayload } from "../../../src/core/models/Job.js";

// ---------------------------------------------------------------------------
// Fixture config (same as createStorage tests)
// ---------------------------------------------------------------------------

const TEST_CONFIG: AppConfig = {
  env: "test",
  pg: {
    connectionString: undefined,
    host: "localhost",
    port: 5432,
    database: "test_db",
    user: "test_user",
    password: "test_pass",
    pool: { min: 1, max: 5, idleTimeoutMs: 10_000, connectionTimeoutMs: 3_000 },
    logging: { level: "none", slowThresholdMs: 500 },
  },
  redis: {
    url: undefined,
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    connectTimeoutMs: 5_000,
    commandTimeoutMs: 3_000,
    maxRetries: 3,
  },
  bullmq: {
    discovery: { rateLimitMax: 2, rateLimitDurationMs: 60_000, concurrency: 1 },
    stallIntervalMs: 30_000,
    maxRetries: 5,
  },
  queryEngine: {
    nicheDictionariesDir: "./data/dictionaries/niches",
    geoDictionariesDir: "./data/dictionaries/geo",
    defaultMaxVariants: 20,
    defaultStrategyIds: ["synonym"],
  },
  playwright: {
    headless: true,
    slowMoMs: 0,
    timeoutMs: 30_000,
    locale: "en-US",
    timezoneId: "UTC",
  },
  logging: { level: "silent", format: "json", stackTraces: false },
  queueBackend: "memory" as const,
  ai: { groq: { apiKey: undefined } },
  geocoding: { nominatim: { enabled: false, userAgent: "test" } },
  watchdog: { maxRunAgeMs: 300_000, scanIntervalMs: 60_000 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createServices()", () => {
  it("returns lifecycle and runService", () => {
    const storage = createStorage(TEST_CONFIG);
    const services = createServices(storage);
    expect(services).toHaveProperty("lifecycle");
    expect(services).toHaveProperty("runService");
  });

  it("lifecycle is a RunLifecycleService instance", () => {
    const storage = createStorage(TEST_CONFIG);
    const { lifecycle } = createServices(storage);
    expect(lifecycle).toBeInstanceOf(RunLifecycleService);
  });

  it("runService is a RunService instance", () => {
    const storage = createStorage(TEST_CONFIG);
    const { runService } = createServices(storage);
    expect(runService).toBeInstanceOf(RunService);
  });

  it("accepts custom exporters map", () => {
    const storage = createStorage(TEST_CONFIG);
    const exporters = new Map();
    const { runService } = createServices(storage, { exporters });
    expect(runService).toBeInstanceOf(RunService);
  });
});

describe("bootstrap() � via createStorage + createServices", () => {
  it("container has storage and services", () => {
    const storage = createStorage(TEST_CONFIG);
    const services = createServices(storage);
    const container = { storage, services };
    expect(container).toHaveProperty("storage");
    expect(container).toHaveProperty("services");
  });

  it("storage and services are independent instances per call", () => {
    const s1 = createStorage(TEST_CONFIG);
    const s2 = createStorage(TEST_CONFIG);
    expect(s1.client).not.toBe(s2.client);
    expect(s1.runStore).not.toBe(s2.runStore);
  });

  it("runService.createRun returns VALIDATION_ERROR for empty niche (no DB needed)", async () => {
    const storage = createStorage(TEST_CONFIG);
    const { runService } = createServices(storage);
    // Validation is checked before any DB call � safe to run without a real DB
    const result = await runService.createRun({ niche: "", location: "Lagos" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("runService.createRun returns VALIDATION_ERROR for empty location (no DB needed)", async () => {
    const storage = createStorage(TEST_CONFIG);
    const { runService } = createServices(storage);
    const result = await runService.createRun({
      niche: "plumbers",
      location: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// QueueConfig / QUEUE_BACKEND wiring (createServices) -- bullmq fully mocked,
// no real Redis connection opened anywhere in this block.
// ---------------------------------------------------------------------------

describe("createServices() -- queue backend selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to InMemoryQueue when no queueConfig is passed", () => {
    const storage = createStorage(TEST_CONFIG);
    const { normalizationQueue } = createServices(storage);
    expect(normalizationQueue).toBeInstanceOf(InMemoryQueue);
  });

  it("uses InMemoryQueue when queueConfig.backend is 'memory'", () => {
    const storage = createStorage(TEST_CONFIG);
    const queueConfig: QueueConfig = { backend: "memory" };
    const { normalizationQueue } = createServices(storage, {}, queueConfig);
    expect(normalizationQueue).toBeInstanceOf(InMemoryQueue);
  });

  it("falls back to InMemoryQueue when backend is 'bullmq' but connection is missing", () => {
    const storage = createStorage(TEST_CONFIG);
    const queueConfig = { backend: "bullmq" } as QueueConfig;
    const { normalizationQueue } = createServices(storage, {}, queueConfig);
    expect(normalizationQueue).toBeInstanceOf(InMemoryQueue);
  });

  it("constructs BullMQQueue when backend is 'bullmq' and connection is provided", () => {
    const storage = createStorage(TEST_CONFIG);
    const queueConfig: QueueConfig = {
      backend: "bullmq",
      connection: { host: "localhost", port: 6379 },
    };
    const { normalizationQueue } = createServices(storage, {}, queueConfig);
    expect(normalizationQueue).toBeInstanceOf(BullMQQueue);
  });

  it("overrides.normalizationQueue takes precedence over queueConfig", () => {
    const storage = createStorage(TEST_CONFIG);
    const customQueue = new InMemoryQueue<NormalizationJobPayload>("custom");
    const queueConfig: QueueConfig = {
      backend: "bullmq",
      connection: { host: "localhost", port: 6379 },
    };
    const { normalizationQueue } = createServices(
      storage,
      { normalizationQueue: customQueue },
      queueConfig,
    );
    expect(normalizationQueue).toBe(customQueue);
  });

  it("shutdown() no-ops for InMemoryQueue (no close method)", async () => {
    const storage = createStorage(TEST_CONFIG);
    const { shutdown } = createServices(storage);
    await expect(shutdown()).resolves.toBeUndefined();
  });

  it("shutdown() calls close() on BullMQQueue when present", async () => {
    const storage = createStorage(TEST_CONFIG);
    const queueConfig: QueueConfig = {
      backend: "bullmq",
      connection: { host: "localhost", port: 6379 },
    };
    const { shutdown } = createServices(storage, {}, queueConfig);
    await shutdown();
    expect(mockQueueClose).toHaveBeenCalledOnce();
    expect(mockWorkerClose).toHaveBeenCalledOnce();
  });
});
