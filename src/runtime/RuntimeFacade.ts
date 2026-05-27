/**
 * @module runtime/RuntimeFacade
 *
 * Stable public API for the runtime. Delegates only — no logic.
 */

import type { IProvider, DiscoveryOptions } from "../core/interfaces/IProvider.js";
import type { ResolvedQuery } from "../core/models/Query.js";
import type { RunID } from "../core/types/common.js";
import type { RunStats } from "../core/models/Job.js";
import type { RunService } from "../api/RunService.js";
import type { RuntimeExecutor, ExecutionSummary } from "./RuntimeExecutor.js";
import type { KeywordExpansionService, ExpansionResponse } from "../ai/KeywordExpansionService.js";
import type { CreateRunRequest, RecordListRequest } from "../api/types.js";

export type { ExpansionResponse };
export type { ExpandedKeyword } from "../ai/IKeywordExpansionProvider.js";

export interface CreateRunResult {
  readonly runId: string;
  readonly status: string;
}

export interface RunView {
  readonly id: string;
  readonly status: string;
  readonly niche: string;
  readonly location: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly stats: RunStats;
}

export interface RecordPage {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly phone: string | null;
    readonly normalizedPhone: string | null;
    readonly website: string | null;
    readonly city: string | null;
    readonly country: string | null;
    readonly primaryCategory: string | null;
    readonly rating: number | null;
    readonly sourceProvider: string;
  }[];
  readonly total: number;
  readonly page: number;
  readonly hasMore: boolean;
}

export interface ExecuteRunOptions {
  readonly provider: IProvider;
  readonly runId: RunID;
  readonly query: ResolvedQuery;
  readonly discoveryOptions?: DiscoveryOptions;
}

export interface ExpandKeywordOptions {
  readonly keyword: string;
  readonly location?: string;
  readonly limit?: number;
}

export class RuntimeFacade {
  constructor(
    private readonly runService: RunService,
    private readonly runtimeExecutor: RuntimeExecutor,
    private readonly expansionService: KeywordExpansionService,
  ) {}

  async expandKeyword(opts: ExpandKeywordOptions): Promise<ExpansionResponse> {
    const expansionOpts = {
      ...(opts.location !== undefined ? { location: opts.location } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    };
    return this.expansionService.expand(opts.keyword, expansionOpts);
  }

  async createRun(request: CreateRunRequest): Promise<CreateRunResult> {
    const result = await this.runService.createRun(request);
    if (!result.ok) throw new Error(result.error.message);
    return { runId: result.data.id, status: result.data.status };
  }

  async executeRun(opts: ExecuteRunOptions): Promise<ExecutionSummary> {
    return this.runtimeExecutor.execute(opts);
  }

  async getRun(runId: string): Promise<RunView | null> {
    const result = await this.runService.getRun(runId);
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") return null;
      throw new Error(result.error.message);
    }
    return result.data;
  }

  async listRecords(runId: string, page = 1, pageSize = 20): Promise<RecordPage> {
    const req: RecordListRequest = { runId, page, pageSize };
    const result = await this.runService.listRecords(req);
    if (!result.ok) throw new Error(result.error.message);
    return {
      items: result.data.items,
      total: result.data.total,
      page: result.data.page,
      hasMore: result.data.hasMore,
    };
  }
}