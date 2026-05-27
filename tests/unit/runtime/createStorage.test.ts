/**
 * tests/unit/runtime/createStorage.test.ts
 *
 * Verifies that createStorage() correctly maps AppConfig.pg fields
 * onto the assembled storage object.
 *
 * No DB connections are opened � PostgresClient is lazy.
 */

import { describe, it, expect } from "vitest";
import { createStorage } from "../../../src/runtime/createStorage.js";
import { PostgresClient } from "../../../src/storage/PostgresClient.js";
import { PostgresRunRepository } from "../../../src/storage/PostgresRunRepository.js";
import { PostgresRecordRepository } from "../../../src/storage/PostgresRecordRepository.js";
import {
  PostgresRunServiceAdapter,
  PostgresRecordServiceAdapter,
} from "../../../src/storage/PostgresRunServiceAdapter.js";
import type { AppConfig } from "../../../src/config/env.js";

// ---------------------------------------------------------------------------
// Minimal AppConfig fixture � only pg fields are exercised here
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<AppConfig["pg"]> = {}): AppConfig {
  return {
    env: "test",
    pg: {
      connectionString: undefined,
      host: "test-host",
      port: 5432,
      database: "test-db",
      user: "test-user",
      password: "test-pass",
      pool: {
        min: 1,
        max: 5,
        idleTimeoutMs: 10_000,
        connectionTimeoutMs: 3_000,
      },
      logging: { level: "none", slowThresholdMs: 500 },
      ...overrides,
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
      discovery: {
        rateLimitMax: 2,
        rateLimitDurationMs: 60_000,
        concurrency: 1,
      },
      stallIntervalMs: 30_000,
      maxRetries: 5,
    },
    queryEngine: {
      nicheDictionariesDir: "./data/dictionaries/niches",
      geoDictionariesDir: "./data/dictionaries/geo",
      defaultMaxVariants: 20,
      defaultStrategyIds: ["synonym", "modifier"],
    },
    playwright: {
      headless: true,
      slowMoMs: 0,
      timeoutMs: 30_000,
      locale: "en-US",
      timezoneId: "UTC",
    },
    logging: {
      level: "silent",
      format: "json",
      stackTraces: false,
    },
    export: {
      outputDir: "./data/exports",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createStorage()", () => {
  it("returns an AssembledStorage object", () => {
    const storage = createStorage(makeConfig());
    expect(storage).toBeDefined();
  });

  it("client is a PostgresClient instance", () => {
    const { client } = createStorage(makeConfig());
    expect(client).toBeInstanceOf(PostgresClient);
  });

  it("runStore is a PostgresRunRepository instance", () => {
    const { runStore } = createStorage(makeConfig());
    expect(runStore).toBeInstanceOf(PostgresRunRepository);
  });

  it("recordStore is a PostgresRecordRepository instance", () => {
    const { recordStore } = createStorage(makeConfig());
    expect(recordStore).toBeInstanceOf(PostgresRecordRepository);
  });

  it("runServiceStore is a PostgresRunServiceAdapter instance", () => {
    const { runServiceStore } = createStorage(makeConfig());
    expect(runServiceStore).toBeInstanceOf(PostgresRunServiceAdapter);
  });

  it("recordServiceStore is a PostgresRecordServiceAdapter instance", () => {
    const { recordServiceStore } = createStorage(makeConfig());
    expect(recordServiceStore).toBeInstanceOf(PostgresRecordServiceAdapter);
  });

  it("all five storage fields are present", () => {
    const storage = createStorage(makeConfig());
    expect(storage).toHaveProperty("client");
    expect(storage).toHaveProperty("runStore");
    expect(storage).toHaveProperty("recordStore");
    expect(storage).toHaveProperty("runServiceStore");
    expect(storage).toHaveProperty("recordServiceStore");
  });

  it("different configs produce independent client instances", () => {
    const a = createStorage(makeConfig({ host: "host-a" }));
    const b = createStorage(makeConfig({ host: "host-b" }));
    expect(a.client).not.toBe(b.client);
  });
});
