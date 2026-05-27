/**
 * @module runtime/RuntimeFacade
 *
 * Stable public API for the runtime. Delegates only — no logic.
 */

import type { IProvider, DiscoveryOptions } from "../core/interfaces/IProvider.js";
import type { ResolvedQuery, QuerySeed } from "../core/models/Query.js";
import type { RunID } from "../core/types/common.js";
import type { RunStats } from "../core/models/Job.js";
import type { RunService } from "../api/RunService.js";
import type { RuntimeExecutor, ExecutionSummary } from "./RuntimeExecutor.js";
import type { KeywordExpansionService, ExpansionResponse } from "../ai/KeywordExpansionService.js";
import type { CreateRunRequest, RecordListRequest } from "../api/types.js";
import type { QueryEngine } from "../query-engine/QueryEngine.js";
import type { PassthroughGeoResolver } from "../query-engine/GeoResolver.js";
import type { ResolvedQueryFactory } from "../query-engine/ResolvedQueryFactory.js";
import type { GeoTarget } from "../core/types/geo.js";

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

/**
 * Seed-based execution options.
 * The facade resolves keyword + location into a ResolvedQuery internally.
 */
export interface ExecuteFromSeedOptions {
  readonly provider: IProvider;
  readonly runId: RunID;
  /** Human-readable niche / keyword, e.g. "plumbers" */
  readonly keyword: string;
  /** Human-readable location string, e.g. "Lagos, Nigeria" */
  readonly location: string;
  readonly discoveryOptions?: DiscoveryOptions;
}

export class RuntimeFacade {
  constructor(
    private readonly runService: RunService,
    private readonly runtimeExecutor: RuntimeExecutor,
    private readonly expansionService: KeywordExpansionService,
    private readonly queryEngine: QueryEngine,
    private readonly geoResolver: PassthroughGeoResolver,
    private readonly resolvedQueryFactory: ResolvedQueryFactory,
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

  /**
   * Builds a ResolvedQuery from a keyword + location string, then executes.
   *
   * Flow:
   *   1. Build QuerySeed from keyword + location string
   *   2. QueryEngine.generate() → GeneratedQuery[] (geo resolved internally)
   *   3. Resolve geo via PassthroughGeoResolver for ResolvedQuery assembly
   *   4. Assemble ResolvedQuery via ResolvedQueryFactory
   *   5. Delegate to RuntimeExecutor.execute()
   *
   * RuntimeExecutor is completely unchanged — it still receives a ResolvedQuery.
   */
  async executeFromSeed(opts: ExecuteFromSeedOptions): Promise<ExecutionSummary> {
    const geoTarget: GeoTarget = {
      displayName: opts.location,
      country: opts.location,
    };

    const seed: QuerySeed = {
      niche: opts.keyword,
      location: geoTarget,
      // No expansion strategies for now — just the root query.
      // Milestone C will wire multi-variant dispatch.
      expansionStrategyIds: [],
    };

    const genResult = await this.queryEngine.generate(
      seed,
      opts.runId,
      [opts.provider.id],
    );

    if (!genResult.ok) {
      throw new Error(
        `Query generation failed [${genResult.error.code}]: ${genResult.error.message}`,
      );
    }

    // queries[0] is always the root seed query; generate() guarantees at
    // least one entry on Ok, but we guard explicitly to satisfy TypeScript.
    const rootQuery = genResult.value[0];
    if (rootQuery === undefined) {
      throw new Error("Query generation returned an empty result set");
    }

    // Resolve geo for ResolvedQuery assembly. PassthroughGeoResolver uses
    // country centroid tables and never makes external calls. This mirrors
    // what QueryEngine already did internally — if the engine succeeded,
    // this call will also succeed with the same result.
    const geoResult = await this.geoResolver.resolve(geoTarget);
    const resolvedGeo = geoResult.ok
      ? geoResult.value
      : { ...geoTarget, resolvedCoordinates: { lat: 0, lng: 0 } };

    const resolvedQuery = this.resolvedQueryFactory.create(rootQuery, resolvedGeo);

    return this.runtimeExecutor.execute({
      provider: opts.provider,
      runId: opts.runId,
      query: resolvedQuery,
      ...(opts.discoveryOptions !== undefined
        ? { discoveryOptions: opts.discoveryOptions }
        : {}),
    });
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
