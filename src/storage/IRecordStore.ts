import type { BusinessRecord } from "../core/models/BusinessRecord.js";

export interface IRecordStore {
  insert(record: BusinessRecord): Promise<void>;

  insertMany(records: readonly BusinessRecord[]): Promise<number>;

  getByRunId(runId: string): Promise<readonly BusinessRecord[]>;
  getByRunIdPaginated(runId: string, limit: number, offset: number): Promise<readonly BusinessRecord[]>;

  countByRunId(runId: string): Promise<number>;
}
