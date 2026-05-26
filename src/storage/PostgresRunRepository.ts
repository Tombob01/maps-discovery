/**
 * @module storage/PostgresRunRepository
 *
 * Postgres-backed implementation of IRunStore.
 *
 * All serialisation / deserialisation between the TypeScript Run model
 * and Postgres rows is handled here — no raw SQL leaks to callers.
 *
 * Column ↔ field mapping
 *   id            ↔  run.id
 *   status        ↔  run.status
 *   config        ↔  run.config          (JSONB)
 *   started_at    ↔  run.startedAt       (TIMESTAMPTZ | NULL)
 *   completed_at  ↔  run.completedAt     (TIMESTAMPTZ | NULL)
 *   created_at    ↔  run.createdAt       (TIMESTAMPTZ)
 *   stats         ↔  run.stats           (JSONB)
 */

import type { Run, RunStats } from "../core/models/Job.js";
import type { RunConfig } from "../core/models/Query.js";
import type { RunID, RunStatus } from "../core/types/common.js";
import type { IRunStore } from "./IRunStore.js";
import type { PostgresClient, Row } from "./PostgresClient.js";

// ---------------------------------------------------------------------------
// DB row shape — what pg returns for SELECT * FROM runs
// ---------------------------------------------------------------------------

interface RunRow extends Row {
  id: string;
  status: string;
  config: RunConfig;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  stats: RunStats;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRun(row: RunRow): Run {
  return {
    id: row.id as RunID,
    status: row.status as RunStatus,
    config: row.config,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    stats: row.stats,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PostgresRunRepository implements IRunStore {
  private readonly db: PostgresClient;

  constructor(db: PostgresClient) {
    this.db = db;
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(run: Run): Promise<void> {
    await this.db.query(
      `INSERT INTO runs
         (id, status, config, started_at, completed_at, created_at, stats)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        run.id,
        run.status,
        JSON.stringify(run.config),
        run.startedAt ?? null,
        run.completedAt ?? null,
        run.createdAt,
        JSON.stringify(run.stats),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  async getById(runId: string): Promise<Run | null> {
    const { rows } = await this.db.query<RunRow>(
      `SELECT id, status, config, started_at, completed_at, created_at, stats
         FROM runs
        WHERE id = $1`,
      [runId],
    );
    const row = rows[0];
    return row !== undefined ? rowToRun(row) : null;
  }

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  async list(limit = 100): Promise<readonly Run[]> {
    const { rows } = await this.db.query<RunRow>(
      `SELECT id, status, config, started_at, completed_at, created_at, stats
         FROM runs
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map(rowToRun);
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  async update(run: Run): Promise<void> {
    await this.db.query(
      `UPDATE runs
          SET status       = $2,
              config       = $3,
              started_at   = $4,
              completed_at = $5,
              stats        = $6
        WHERE id = $1`,
      [
        run.id,
        run.status,
        JSON.stringify(run.config),
        run.startedAt ?? null,
        run.completedAt ?? null,
        JSON.stringify(run.stats),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  async delete(runId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM runs WHERE id = $1`,
      [runId],
    );
    return (rowCount ?? 0) > 0;
  }
}
