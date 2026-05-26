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

// ---------------------------------------------------------------------------
// Export options
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Export filter — declarative row-level filtering
// ---------------------------------------------------------------------------

export type ExportFilterOperator =
  | "eq" // field === value
  | "neq" // field !== value
  | "gt" // field > value  (numeric)
  | "gte" // field >= value (numeric)
  | "lt" // field < value  (numeric)
  | "lte" // field <= value (numeric)
  | "in" // value is in field (array field)
  | "isNull"
  | "isNotNull";

export interface ExportFilter {
  readonly field: keyof BusinessRecord;
  readonly operator: ExportFilterOperator;
  readonly value?: unknown; // undefined for isNull / isNotNull
}

// ---------------------------------------------------------------------------
// Export result
// ---------------------------------------------------------------------------

export interface ExportResult {
  readonly recordsWritten: number;
  readonly recordsSkipped: number;
  readonly destination: string;
  readonly format: ExportFormat;
  readonly exportedAt: Date;
  /** Byte size of written output, if measurable. */
  readonly bytesWritten?: number;
}

// ---------------------------------------------------------------------------
// IExporter — single-format exporter contract
// ---------------------------------------------------------------------------

export interface IExporter {
  /** The format this exporter handles. */
  readonly format: ExportFormat;

  /**
   * Exports a batch of records to the configured destination.
   * Returns Err on write failure — does NOT throw.
   */
  export(
    records: readonly BusinessRecord[],
    options: ExportOptions,
  ): Promise<Result<ExportResult, ExportErrorDetail>>;

  /**
   * Exports a single record.
   * Convenience wrapper around export() for single-record export jobs.
   */
  exportOne(
    record: BusinessRecord,
    options: ExportOptions,
  ): Promise<Result<ExportResult, ExportErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IExporterRegistry — manages available exporter instances
// ---------------------------------------------------------------------------

export interface IExporterRegistry {
  get(format: ExportFormat): IExporter | null;
  getAll(): readonly IExporter[];
  register(exporter: IExporter): void;
  has(format: ExportFormat): boolean;
}

// ---------------------------------------------------------------------------
// Error types — ExportErrorCode lives in errors/ExportError.ts
// ---------------------------------------------------------------------------

export type { ExportErrorCode } from "../errors/ExportError.js";
import type { ExportErrorCode } from "../errors/ExportError.js";

export interface ExportErrorDetail {
  readonly code: ExportErrorCode;
  readonly message: string;
  readonly format: ExportFormat;
  readonly destination: string;
  readonly cause?: unknown;
}
