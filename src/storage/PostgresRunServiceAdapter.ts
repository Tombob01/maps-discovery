/**
 * @module storage/PostgresRunServiceAdapter
 *
 * Adapter that satisfies RunService.IRunStore using the storage-layer
 * PostgresRunRepository.
 *
 * Why this exists:
 *   RunService.IRunStore declares { findById, list() → Run[] }
 *   storage.IRunStore   declares { getById, list(limit?) → readonly Run[] }
 *
 * The two interfaces evolved independently. Rather than changing either
 * public interface (which would break callers), we bridge them here.
 * The adapter is the only place that knows both shapes.
 *
 * RunService.IRecordStore.list(req) is not part of storage.IRecordStore
 * (it requires pagination / filtering). PostgresRecordServiceAdapter
 * provides a minimal client-side implementation using getByRunId() until
 * a dedicated DB query is warranted.
 */

import type { Run } from "../core/models/Job.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { IRunStore as StorageIRunStore } from "./IRunStore.js";
import type { IRecordStore as StorageIRecordStore } from "./IRecordStore.js";

// These interface shapes come from RunService — we re-declare them here so
// this module compiles without importing from src/api (avoids a circular dep).
export interface RunServiceRunStore {
  create(run: Run): Promise<void>;
  findById(id: string): Promise<Run | null>;
  list(): Promise<Run[]>;
}

export interface RunServiceRecordStore {
  findByRunId(runId: string): Promise<BusinessRecord[]>;
  list(
    req: RecordListRequest,
  ): Promise<{ items: BusinessRecord[]; total: number }>;
}

export interface RecordListRequest {
  readonly runId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// PostgresRunServiceAdapter
// ---------------------------------------------------------------------------

/**
 * Wraps PostgresRunRepository to satisfy RunService.IRunStore.
 *
 * Usage:
 *   const adapter = new PostgresRunServiceAdapter(postgresRunRepo);
 *   const service = new RunService(adapter, recordAdapter, exporters);
 */
export class PostgresRunServiceAdapter implements RunServiceRunStore {
  private readonly store: StorageIRunStore;

  constructor(store: StorageIRunStore) {
    this.store = store;
  }

  async create(run: Run): Promise<void> {
    return this.store.create(run);
  }

  async findById(id: string): Promise<Run | null> {
    return this.store.getById(id);
  }

  async list(): Promise<Run[]> {
    // storage.IRunStore.list() returns readonly Run[] — cast is safe since
    // RunService only reads the array
    const runs = await this.store.list();
    return runs as Run[];
  }
}

// ---------------------------------------------------------------------------
// PostgresRecordServiceAdapter
// ---------------------------------------------------------------------------

/**
 * Wraps PostgresRecordRepository to satisfy RunService.IRecordStore.
 *
 * list() performs client-side pagination over getByRunId results.
 * This is acceptable at current scale; replace with a parameterised SQL
 * query when result sets grow large enough to matter.
 *
 * TODO(perf): push pagination and filtering into the DB query when
 *             result sets exceed a few thousand records per run.
 */
export class PostgresRecordServiceAdapter implements RunServiceRecordStore {
  private readonly store: StorageIRecordStore;

  constructor(store: StorageIRecordStore) {
    this.store = store;
  }

  async findByRunId(runId: string): Promise<BusinessRecord[]> {
    const records = await this.store.getByRunId(runId);
    return records as BusinessRecord[];
  }

  async list(
    req: RecordListRequest,
  ): Promise<{ items: BusinessRecord[]; total: number }> {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, req.pageSize ?? 20));

    // If a runId filter is given, fetch only that run's records.
    // Otherwise fall back to an empty result — a full-table scan without
    // a run filter is not exposed by storage.IRecordStore by design.
    let allRecords: readonly BusinessRecord[];
    if (typeof req.runId === "string" && req.runId.length > 0) {
      allRecords = await this.store.getByRunId(req.runId);
    } else {
      allRecords = [];
    }

    const total = allRecords.length;
    const start = (page - 1) * pageSize;
    const items = allRecords.slice(start, start + pageSize);

    return { items, total };
  }
}
