import type { BusinessRecord } from "../core/models/BusinessRecord.js";

export interface IRecordStore {
  insert(record: BusinessRecord): Promise<void>;

  insertMany(records: readonly BusinessRecord[]): Promise<void>;

  getByRunId(runId: string): Promise<readonly BusinessRecord[]>;

  countByRunId(runId: string): Promise<number>;
}
