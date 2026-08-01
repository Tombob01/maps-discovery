/**
 * @module storage/PostgresRawResultRepository
 *
 * Postgres-backed implementation of IRawResultStore.
 * fetch() queries by provider_result_id ORDER BY created_at DESC LIMIT 1.
 * save() uses ON CONFLICT ON CONSTRAINT uq_raw_results_provider_result DO NOTHING.
 */

import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { RunID, QueryID, UUID } from "../core/types/common.js";
import type { ResumeToken } from "../core/types/pagination.js";
import type { IRawResultStore } from "./IRawResultStore.js";
import type { PostgresClient, Row } from "./PostgresClient.js";

interface RawResultRow extends Row {
  id: string;
  run_id: string;
  query_id: string | null;
  provider_id: string;
  provider_result_id: string;
  raw_payload: unknown;
  resume_token: unknown;
  source_url: string | null;
  collected_at: Date;
  processed: boolean;
}

function rowToProviderResult(row: RawResultRow): ProviderResult {
  return {
    providerId: row.provider_id,
    providerResultId: row.provider_result_id,
    rawPayload: row.raw_payload,
    resumeToken: row.resume_token as ResumeToken,
    sourceUrl: row.source_url,
    collectedAt: row.collected_at,
    runId: row.run_id as RunID,
    queryId: row.query_id as QueryID,
  };
}

export class PostgresRawResultRepository implements IRawResultStore {
  constructor(private readonly db: PostgresClient) {}

  async save(result: ProviderResult): Promise<boolean> {
    const sql =
      "INSERT INTO raw_results" +
      " (run_id, query_id, provider_id, provider_result_id," +
      "  raw_payload, resume_token, source_url, collected_at)" +
      " VALUES ($1, $2, $3, $4, $5, $6, $7, $8)" +
      " ON CONFLICT ON CONSTRAINT uq_raw_results_provider_result DO NOTHING";
    const pgResult = await this.db.query(sql, [
      result.runId,
      null, // query_id: deferred - queries table not yet populated (KI-2)
      result.providerId,
      result.providerResultId,
      JSON.stringify(result.rawPayload),
      result.resumeToken != null ? JSON.stringify(result.resumeToken) : null,
      result.sourceUrl ?? null,
      result.collectedAt,
    ]);
    return (pgResult.rowCount ?? 0) > 0;
  }

  async fetch(id: string): Promise<ProviderResult | null> {
    const sql =
      "SELECT id, run_id, query_id, provider_id, provider_result_id," +
      " raw_payload, resume_token, source_url, collected_at, processed" +
      " FROM raw_results" +
      " WHERE provider_result_id = $1" +
      " ORDER BY created_at DESC" +
      " LIMIT 1";
    const { rows } = await this.db.query<RawResultRow>(sql, [id]);
    const row = rows[0];
    return row !== undefined ? rowToProviderResult(row) : null;
  }

  async fetchById(id: UUID): Promise<ProviderResult | null> {
    const sql =
      "SELECT id, run_id, query_id, provider_id, provider_result_id," +
      " raw_payload, resume_token, source_url, collected_at, processed" +
      " FROM raw_results" +
      " WHERE id = $1";
    const { rows } = await this.db.query<RawResultRow>(sql, [id]);
    const row = rows[0];
    return row !== undefined ? rowToProviderResult(row) : null;
  }

  async saveAndGetId(result: ProviderResult): Promise<{ id: UUID; isNew: boolean }> {
    const insertSql =
      "INSERT INTO raw_results" +
      " (run_id, query_id, provider_id, provider_result_id," +
      "  raw_payload, resume_token, source_url, collected_at)" +
      " VALUES ($1, $2, $3, $4, $5, $6, $7, $8)" +
      " ON CONFLICT ON CONSTRAINT uq_raw_results_provider_result DO NOTHING" +
      " RETURNING id";
    const { rows } = await this.db.query<{ id: string }>(insertSql, [
      result.runId,
      null, // query_id: deferred - queries table not yet populated (KI-2)
      result.providerId,
      result.providerResultId,
      JSON.stringify(result.rawPayload),
      result.resumeToken != null ? JSON.stringify(result.resumeToken) : null,
      result.sourceUrl ?? null,
      result.collectedAt,
    ]);

    const insertedRow = rows[0];
    if (insertedRow !== undefined) {
      return { id: insertedRow.id as UUID, isNew: true };
    }

    // Conflict occurred (DO NOTHING) -- RETURNING yielded no row. Fall back
    // to a lookup keyed on the exact same uniqueness dimensions as
    // uq_raw_results_provider_result, to preserve existing idempotency
    // semantics without redesigning the uniqueness model.
    const fallbackSql =
      "SELECT id" +
      " FROM raw_results" +
      " WHERE run_id = $1 AND provider_id = $2 AND provider_result_id = $3" +
      " ORDER BY created_at DESC" +
      " LIMIT 1";
    const { rows: fallbackRows } = await this.db.query<{ id: string }>(fallbackSql, [
      result.runId,
      result.providerId,
      result.providerResultId,
    ]);
    const existingRow = fallbackRows[0];
    if (existingRow === undefined) {
      throw new Error(
        "PostgresRawResultRepository.saveAndGetId(): INSERT reported a conflict but no existing row was found on fallback lookup",
      );
    }
    return { id: existingRow.id as UUID, isNew: false };
  }
}
