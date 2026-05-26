import type { Run } from "../core/models/Job.js";

import type { IRunStore } from "./IRunStore.js";

export class PostgresRunRepository implements IRunStore {
  async create(_run: Run): Promise<void> {
    throw new Error("Not implemented");
  }

  async getById(_runId: string): Promise<Run | null> {
    throw new Error("Not implemented");
  }

  async list(): Promise<readonly Run[]> {
    throw new Error("Not implemented");
  }

  async update(_run: Run): Promise<void> {
    throw new Error("Not implemented");
  }

  async delete(_runId: string): Promise<boolean> {
    throw new Error("Not implemented");
  }
}
