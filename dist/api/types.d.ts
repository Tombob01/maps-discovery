/**
 * @module api/types
 *
 * Request / response shapes for the lead discovery HTTP API.
 * These are plain data types â€” no framework dependency.
 */
import type { RunStatus, RunStats } from "../core/models/Job.js";
import type { NormalizationStatus, DeduplicationStatus, ExportStatus } from "../core/types/common.js";
export interface ApiError {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
}
export interface ApiResponse<T> {
    readonly ok: true;
    readonly data: T;
}
export interface ApiErrorResponse {
    readonly ok: false;
    readonly error: ApiError;
}
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;
export interface CreateRunRequest {
    readonly niche: string;
    readonly location: string;
    readonly providerIds?: string[];
}
export interface RunSummary {
    readonly id: string;
    readonly status: RunStatus;
    readonly niche: string;
    readonly location: string;
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly stats: RunStats;
}
export interface RecordListRequest {
    readonly runId?: string;
    readonly deduplicationStatus?: DeduplicationStatus;
    readonly normalizationStatus?: NormalizationStatus;
    readonly exportStatus?: ExportStatus;
    readonly page?: number;
    readonly pageSize?: number;
}
export interface RecordSummary {
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
    readonly normalizationStatus: NormalizationStatus;
    readonly deduplicationStatus: DeduplicationStatus;
    readonly exportStatus: ExportStatus;
}
export interface PaginatedResponse<T> {
    readonly items: T[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly hasMore: boolean;
}
export interface ExportRequest {
    readonly runId: string;
    readonly format: "csv" | "jsonl";
    readonly destination: string;
}
export interface ExportSummary {
    readonly recordsExported: number;
    readonly format: string;
    readonly destination: string;
}
//# sourceMappingURL=types.d.ts.map