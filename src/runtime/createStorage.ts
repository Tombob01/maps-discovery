/**
 * @module runtime/createStorage
 *
 * Assembles the storage layer from configuration.
 */

import type { AppConfig } from "../config/env.js";
import { PostgresClient } from "../storage/PostgresClient.js";
import { PostgresRunRepository } from "../storage/PostgresRunRepository.js";
import { PostgresRecordRepository } from "../storage/PostgresRecordRepository.js";
import { PostgresRawResultRepository } from "../storage/PostgresRawResultRepository.js";
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
import type { IRawResultStore } from "../storage/IRawResultStore.js";

export interface AssembledStorage {
  readonly client: PostgresClient;
  readonly runStore: IRunStore;
  readonly recordStore: IRecordStore;
  readonly rawResultStore: IRawResultStore;
  readonly runServiceStore: RunServiceRunStore;
  readonly recordServiceStore: RunServiceRecordStore;
}

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
  const rawResultStore = new PostgresRawResultRepository(client);

  const runServiceStore = new PostgresRunServiceAdapter(runStore);
  const recordServiceStore = new PostgresRecordServiceAdapter(recordStore);

  return {
    client,
    runStore,
    recordStore,
    rawResultStore,
    runServiceStore,
    recordServiceStore,
  };
}
