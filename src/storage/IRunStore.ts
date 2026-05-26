import type { Run } from "../core/models/Job.js";

export interface IRunStore {
  create(run: Run): Promise<void>;

  getById(runId: string): Promise<Run | null>;

  list(limit?: number): Promise<readonly Run[]>;

  update(run: Run): Promise<void>;

  delete(runId: string): Promise<boolean>;
}
