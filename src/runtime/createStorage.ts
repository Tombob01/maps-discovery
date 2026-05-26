/**
 * @module runtime/createStorage
 *
 * Assembles the storage layer from configuration.
 *
 * Wiring order:
 *   env.pg
 *   ? PostgresClient
 *   ? PostgresRunRepository + PostgresRecordRepository
 *   ? PostgresRunServiceAdapter + PostgresRecordServiceAdapter
 *
 * No DB connections are opened here � the pool is lazy.
 * Call storage.client.end() for graceful shutdown.
 */

import type { AppConfig } from "../config/env.js";
import { PostgresClient } from "../storage/PostgresClient.js";
import { PostgresRunRepository } from "../storage/PostgresRunRepository.js";
import { PostgresRecordRepository } from "../storage/PostgresRecordRepository.js";
import {
  PostgresRunServiceAdapter,
  PostgresRecordServiceAdapter,
} from "../storage/PostgresRunServiceAdapter.js";
import type {
  RunServiceRunStore,
  RunServiceRecordStore,
} from "../storage/PostgresRunServiceAdapter.js";
import type { IRunStore } from "../storage/IRunStore.js";
import type { IRecordStore } from "../storage/IRecordStore.js";

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface AssembledStorage {
  /** Raw Postgres pool wrapper � call .end() on shutdown. */
  readonly client: PostgresClient;
  /** storage-layer run store (getById / update). */
  readonly runStore: IRunStore;
  /** storage-layer record store (insertMany / getByRunId). */
  readonly recordStore: IRecordStore;
  /** RunService-compatible run store adapter. */
  readonly runServiceStore: RunServiceRunStore;
  /** RunService-compatible record store adapter. */
  readonly recordServiceStore: RunServiceRecordStore;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Instantiates all storage components from the provided config.
 * Accepts the full AppConfig so callers (bootstrap, tests) control the source.
 */
export function createStorage(config: AppConfig): AssembledStorage {
  const { pg } = config;

  const client = new PostgresClient({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    password: pg.password,
    max: pg.pool.max,
    idleTimeoutMillis: pg.pool.idleTimeoutMs,
    connectionTimeoutMillis: pg.pool.connectionTimeoutMs,
  });

  const runStore = new PostgresRunRepository(client);
  const recordStore = new PostgresRecordRepository(client);

  const runServiceStore = new PostgresRunServiceAdapter(runStore);
  const recordServiceStore = new PostgresRecordServiceAdapter(recordStore);

  return {
    client,
    runStore,
    recordStore,
    runServiceStore,
    recordServiceStore,
  };
}
