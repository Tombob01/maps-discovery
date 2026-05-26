import type { BusinessRecord } from "../core/models/BusinessRecord.js";

import type { IRecordStore } from "./IRecordStore.js";

export class PostgresRecordRepository implements IRecordStore {
  async insert(_record: BusinessRecord): Promise<void> {
    throw new Error("Not implemented");
  }

  async insertMany(_records: readonly BusinessRecord[]): Promise<void> {
    throw new Error("Not implemented");
  }

  async getByRunId(_runId: string): Promise<readonly BusinessRecord[]> {
    throw new Error("Not implemented");
  }

  async countByRunId(_runId: string): Promise<number> {
    throw new Error("Not implemented");
  }
}
