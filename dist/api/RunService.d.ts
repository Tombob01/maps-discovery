/**
 * @module api/RunService
 *
 * Business logic for creating, retrieving, and summarising runs.
 * Stateless â€” all state lives in the injected store.
 */
import type { CreateRunRequest, RunSummary, ApiResult, RecordListRequest, RecordSummary, PaginatedResponse, ExportRequest, ExportSummary } from "./types.js";
import type { Run } from "../core/models/Job.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { IExporter } from "../exporters/IExporter.js";
export interface IRunStore {
    create(run: Run): Promise<void>;
    findById(id: string): Promise<Run | null>;
    list(): Promise<Run[]>;
}
export interface IRecordStore {
    findByRunId(runId: string): Promise<BusinessRecord[]>;
    list(req: RecordListRequest): Promise<{
        items: BusinessRecord[];
        total: number;
    }>;
}
export declare class RunService {
    private readonly runStore;
    private readonly recordStore;
    private readonly exporters;
    constructor(runStore: IRunStore, recordStore: IRecordStore, exporters: Map<string, IExporter>);
    createRun(req: CreateRunRequest): Promise<ApiResult<RunSummary>>;
    getRun(id: string): Promise<ApiResult<RunSummary>>;
    listRuns(): Promise<ApiResult<RunSummary[]>>;
    listRecords(req: RecordListRequest): Promise<ApiResult<PaginatedResponse<RecordSummary>>>;
    exportRun(req: ExportRequest): Promise<ApiResult<ExportSummary>>;
}
//# sourceMappingURL=RunService.d.ts.map