/**
 * @module core/interfaces/IExporter
 *
 * Exporter contracts — consume normalised BusinessRecords, write output.
 *
 * Exporters:
 *   ✓ Receive a BusinessRecord or batch of BusinessRecords
 *   ✓ Write to a destination (file, DB table, stream)
 *   ✓ Return an ExportResult describing what was written
 *
 * Exporters must NOT:
 *   ✗ Know about providers
 *   ✗ Perform normalization
 *   ✗ Read the queue or DB beyond writing to their destination
 */
import type { BusinessRecord } from "../models/BusinessRecord.js";
import type { ExportFormat, Result } from "../types/common.js";
export interface ExportOptions {
    /**
     * Destination path, table name, or connection string.
     * Interpretation is exporter-specific.
     * e.g. "/exports/run-123.csv", "exported_businesses", "postgres://..."
     */
    readonly destination: string;
    /**
     * Subset of BusinessRecord fields to include in the output.
     * If undefined, all fields are exported.
     */
    readonly fields?: readonly (keyof BusinessRecord)[];
    /** Optional filters applied before writing. */
    readonly filters?: readonly ExportFilter[];
    /**
     * If true and the destination already exists, append rather than overwrite.
     * Exporters that do not support this should return Err.
     */
    readonly append?: boolean;
}
export type ExportFilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "isNull" | "isNotNull";
export interface ExportFilter {
    readonly field: keyof BusinessRecord;
    readonly operator: ExportFilterOperator;
    readonly value?: unknown;
}
export interface ExportResult {
    readonly recordsWritten: number;
    readonly recordsSkipped: number;
    readonly destination: string;
    readonly format: ExportFormat;
    readonly exportedAt: Date;
    /** Byte size of written output, if measurable. */
    readonly bytesWritten?: number;
}
export interface IExporter {
    /** The format this exporter handles. */
    readonly format: ExportFormat;
    /**
     * Exports a batch of records to the configured destination.
     * Returns Err on write failure — does NOT throw.
     */
    export(records: readonly BusinessRecord[], options: ExportOptions): Promise<Result<ExportResult, ExportErrorDetail>>;
    /**
     * Exports a single record.
     * Convenience wrapper around export() for single-record export jobs.
     */
    exportOne(record: BusinessRecord, options: ExportOptions): Promise<Result<ExportResult, ExportErrorDetail>>;
}
export interface IExporterRegistry {
    get(format: ExportFormat): IExporter | null;
    getAll(): readonly IExporter[];
    register(exporter: IExporter): void;
    has(format: ExportFormat): boolean;
}
export type { ExportErrorCode } from "../errors/ExportError.js";
import type { ExportErrorCode } from "../errors/ExportError.js";
export interface ExportErrorDetail {
    readonly code: ExportErrorCode;
    readonly message: string;
    readonly format: ExportFormat;
    readonly destination: string;
    readonly cause?: unknown;
}
//# sourceMappingURL=IExporter.d.ts.map