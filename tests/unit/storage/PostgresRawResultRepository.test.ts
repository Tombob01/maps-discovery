/**
 * @module tests/unit/storage/PostgresRawResultRepository
 *
 * Unit tests for PostgresRawResultRepository.
 * All tests mock PostgresClient.query - no real DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresRawResultRepository } from "../../../src/storage/PostgresRawResultRepository.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import type { ResumeToken } from "../../../src/core/types/pagination.js";
import type { PostgresClient } from "../../../src/storage/PostgresClient.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 1_000_000,
};

function makeResult(
  providerResultId: string,
  runId = "11111111-1111-1111-1111-111111111111" as RunID,
): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId,
    rawPayload: { name: "Test Business", placeId: providerResultId },
    resumeToken: RESUME_TOKEN,
    sourceUrl: "https://maps.example.com/" + providerResultId,
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    runId,
    queryId: "22222222-2222-2222-2222-222222222222" as QueryID,
  };
}

function makeClient(
  rows: unknown[] = [],
  rowCount = 0,
): PostgresClient {
  return {
    query: vi.fn(async () => ({ rows, rowCount })),
  } as unknown as PostgresClient;
}

// ---------------------------------------------------------------------------
// save()
// ---------------------------------------------------------------------------

describe("PostgresRawResultRepository.save", () => {
  it("executes INSERT with all required columns", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);

    await repo.save(makeResult("place-abc"));

    expect(client.query).toHaveBeenCalledOnce();
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO raw_results");
    expect(sql).toContain("provider_result_id");
    expect(sql).toContain("raw_payload");
    expect(sql).toContain("resume_token");
  });

  it("passes providerResultId as the provider_result_id param", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);

    await repo.save(makeResult("ChIJabc123"));

    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    expect(params).toContain("ChIJabc123");
  });

  it("serialises rawPayload to JSON string", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);

    await repo.save(makeResult("place-1"));

    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    const payloadParam = params.find(
      (p) => typeof p === "string" && p.includes("Test Business"),
    );
    expect(payloadParam).toBeDefined();
    const parsed = JSON.parse(payloadParam as string) as Record<string, unknown>;
    expect(parsed).toEqual({ name: "Test Business", placeId: "place-1" });
  });

  it("serialises resumeToken to JSON string", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);

    await repo.save(makeResult("place-2"));

    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    const tokenParam = params.find(
      (p) => typeof p === "string" && p.includes("offset"),
    );
    expect(tokenParam).toBeDefined();
    const parsed = JSON.parse(tokenParam as string) as ResumeToken;
    expect(parsed.strategy).toBe("offset");
    expect(parsed.createdAt).toBe(1_000_000);
  });

  it("passes null for resume_token when resumeToken is null-like", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);
    const result = {
      ...makeResult("place-3"),
      resumeToken: null as unknown as ResumeToken,
    };

    await repo.save(result);

    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    expect(params).toContain(null);
  });

  it("uses conflict constraint for idempotency", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);

    await repo.save(makeResult("place-4"));

    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT ON CONSTRAINT uq_raw_results_provider_result DO NOTHING");
  });

  it("always passes null for query_id (queries table not yet populated, KI-2)", async () => {
    const client = makeClient();
    const repo = new PostgresRawResultRepository(client);
    await repo.save(makeResult("place-5"));
    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    // query_id is always null until the queries table write path is implemented
    expect(params[1]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetch()
// ---------------------------------------------------------------------------

describe("PostgresRawResultRepository.fetch", () => {
  it("returns null when no row found", async () => {
    const client = makeClient([], 0);
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.fetch("missing-id");

    expect(result).toBeNull();
  });

  it("queries by provider_result_id", async () => {
    const client = makeClient([], 0);
    const repo = new PostgresRawResultRepository(client);

    await repo.fetch("target-place-id");

    const params = (client.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe("target-place-id");
  });

  it("uses ORDER BY created_at DESC LIMIT 1", async () => {
    const client = makeClient([], 0);
    const repo = new PostgresRawResultRepository(client);

    await repo.fetch("any-id");

    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(sql).toContain("LIMIT 1");
  });

  it("maps a DB row back to ProviderResult correctly", async () => {
    const dbRow = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      run_id: "11111111-1111-1111-1111-111111111111",
      query_id: null,
      provider_id: "google-maps",
      provider_result_id: "ChIJfetched",
      raw_payload: { name: "Fetched Biz", placeId: "ChIJfetched" },
      resume_token: RESUME_TOKEN,
      source_url: "https://maps.example.com/ChIJfetched",
      collected_at: new Date("2025-06-01T00:00:00Z"),
      processed: false,
    };
    const client = makeClient([dbRow], 1);
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.fetch("ChIJfetched");

    expect(result).not.toBeNull();
    expect(result?.providerResultId).toBe("ChIJfetched");
    expect(result?.providerId).toBe("google-maps");
    expect(result?.runId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result?.rawPayload).toEqual({ name: "Fetched Biz", placeId: "ChIJfetched" });
    expect(result?.sourceUrl).toBe("https://maps.example.com/ChIJfetched");
  });

  it("preserves resumeToken from DB row", async () => {
    const dbRow = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      run_id: "11111111-1111-1111-1111-111111111111",
      query_id: null,
      provider_id: "google-maps",
      provider_result_id: "ChIJtoken",
      raw_payload: {},
      resume_token: RESUME_TOKEN,
      source_url: null,
      collected_at: new Date(),
      processed: false,
    };
    const client = makeClient([dbRow], 1);
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.fetch("ChIJtoken");

    expect((result?.resumeToken as ResumeToken)?.strategy).toBe("offset");
    expect((result?.resumeToken as ResumeToken)?.createdAt).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// fetchById()
// ---------------------------------------------------------------------------

describe("PostgresRawResultRepository.fetchById", () => {
  it("returns null when no row found", async () => {
    const client = makeClient([], 0);
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.fetchById(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as import("../../../src/core/types/common.js").UUID,
    );

    expect(result).toBeNull();
  });

  it("queries by id, not provider_result_id", async () => {
    const client = makeClient([], 0);
    const repo = new PostgresRawResultRepository(client);
    const targetId =
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as import("../../../src/core/types/common.js").UUID;

    await repo.fetchById(targetId);

    const [sql, params] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE id = $1");
    expect(sql).not.toContain("provider_result_id = $1");
    expect(params[0]).toBe(targetId);
  });

  it("maps a DB row back to ProviderResult correctly", async () => {
    const dbRow = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      run_id: "11111111-1111-1111-1111-111111111111",
      query_id: null,
      provider_id: "google-maps",
      provider_result_id: "ChIJbyid",
      raw_payload: { name: "By-Id Biz", placeId: "ChIJbyid" },
      resume_token: RESUME_TOKEN,
      source_url: "https://maps.example.com/ChIJbyid",
      collected_at: new Date("2025-06-01T00:00:00Z"),
      processed: false,
    };
    const client = makeClient([dbRow], 1);
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.fetchById(
      dbRow.id as import("../../../src/core/types/common.js").UUID,
    );

    expect(result).not.toBeNull();
    expect(result?.providerResultId).toBe("ChIJbyid");
    expect(result?.providerId).toBe("google-maps");
  });
});



// ---------------------------------------------------------------------------
// saveAndGetId()
// ---------------------------------------------------------------------------

describe("PostgresRawResultRepository.saveAndGetId", () => {
  it("returns { id, isNew: true } for a new insert", async () => {
    const client = makeClient(
      [{ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }],
      1,
    );
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.saveAndGetId(makeResult("place-new"));

    expect(result.isNew).toBe(true);
    expect(result.id).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("RETURNING id");
  });

  it("returns { id, isNew: false } for a duplicate, via fallback lookup", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "dddddddd-dddd-dddd-dddd-dddddddddddd" }],
        rowCount: 1,
      });
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.saveAndGetId(makeResult("place-dup"));

    expect(result.isNew).toBe(false);
    expect(result.id).toBe("dddddddd-dddd-dddd-dddd-dddddddddddd");
  });

  it("duplicate fallback lookup queries by run_id, provider_id, provider_result_id", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "dddddddd-dddd-dddd-dddd-dddddddddddd" }],
        rowCount: 1,
      });
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    await repo.saveAndGetId(makeResult("place-dup2"));

    const [fallbackSql, fallbackParams] = query.mock.calls[1] as [string, unknown[]];
    expect(fallbackSql).toContain("WHERE run_id = $1 AND provider_id = $2 AND provider_result_id = $3");
    expect(fallbackParams).toContain("place-dup2");
  });
});

// ---------------------------------------------------------------------------
// saveAndGetIdWithWebsiteFill()
//
// Uses this suite's established mocked-PostgresClient convention. These
// tests prove SQL construction, parameters, and control flow -- they
// cannot independently prove PostgreSQL's actual jsonb_set() storage
// behavior against a live database, since no real Postgres instance is
// used anywhere in this test suite.
// ---------------------------------------------------------------------------

describe("PostgresRawResultRepository.saveAndGetIdWithWebsiteFill", () => {
  it("attempts the initial INSERT first, returning isNew: true when it succeeds", async () => {
    const client = makeClient(
      [{ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }],
      1,
    );
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.saveAndGetIdWithWebsiteFill(
      makeResult("place-new-fill"),
      "https://example.com",
    );

    expect(result.isNew).toBe(true);
    expect(result.updated).toBe(false);
    expect(result.id).toBe("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO raw_results");
    expect(sql).toContain("RETURNING id");
  });

  it("on conflict, uses a targeted jsonb_set update rather than replacing raw_payload", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert conflict
      .mockResolvedValueOnce({
        rows: [{ id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }],
        rowCount: 1,
      }); // update succeeds
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.saveAndGetIdWithWebsiteFill(
      makeResult("place-fill"),
      "https://example.com",
    );

    expect(result.isNew).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.id).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");

    const [updateSql] = query.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain("jsonb_set");
    expect(updateSql).toContain("{website}");
    expect(updateSql).not.toContain("SET raw_payload = $1");
  });

  it("JSON-encodes the website as the jsonb_set replacement parameter", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }],
        rowCount: 1,
      });
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    await repo.saveAndGetIdWithWebsiteFill(makeResult("place-fill2"), "https://example.com");

    const [, updateParams] = query.mock.calls[1] as [string, unknown[]];
    expect(updateParams[0]).toBe(JSON.stringify("https://example.com"));
  });

  it("the update WHERE clause guards against overwriting an existing non-empty website", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }],
        rowCount: 1,
      });
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    await repo.saveAndGetIdWithWebsiteFill(makeResult("place-fill3"), "https://example.com");

    const [updateSql] = query.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain("raw_payload->>'website' IS NULL");
    expect(updateSql).toContain("raw_payload->>'website' = ''");
  });

  it("when the update returns no row (existing website already present), falls back to lookup and returns updated: false", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert conflict
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // update matches nothing (already has website)
      .mockResolvedValueOnce({
        rows: [{ id: "gggggggg-gggg-gggg-gggg-gggggggggggg" }],
        rowCount: 1,
      }); // fallback lookup
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    const result = await repo.saveAndGetIdWithWebsiteFill(
      makeResult("place-fill4"),
      "https://different.example.com",
    );

    expect(result.isNew).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.id).toBe("gggggggg-gggg-gggg-gggg-gggggggggggg");
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("fallback lookup queries by run_id, provider_id, provider_result_id", async () => {
    const query = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "gggggggg-gggg-gggg-gggg-gggggggggggg" }],
        rowCount: 1,
      });
    const client = { query } as unknown as PostgresClient;
    const repo = new PostgresRawResultRepository(client);

    await repo.saveAndGetIdWithWebsiteFill(makeResult("place-fill5"), "https://example.com");

    const [fallbackSql, fallbackParams] = query.mock.calls[2] as [string, unknown[]];
    expect(fallbackSql).toContain("WHERE run_id = $1 AND provider_id = $2 AND provider_result_id = $3");
    expect(fallbackParams).toContain("place-fill5");
  });
});
