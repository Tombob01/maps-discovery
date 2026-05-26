/**
 * @module exporters/IExporter
 *
 * Contract for record exporters.
 *
 * An exporter serialises one or more BusinessRecords into a target format
 * (CSV, JSON, JSONL) and writes them to a destination (file path, stream,
 * in-memory buffer).
 *
 * Exporters are stateless; state (open file handles etc.) is managed by
 * the concrete implementation's lifecycle methods if needed.
 */

import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Export result
// ---------------------------------------------------------------------------

export interface ExportResult {
  /** Number of records successfully written. */
  readonly recordsWritten: number;
  /** Destination path or identifier where data was written. */
  readonly destination: string;
  /** Format tag for logging. */
  readonly format: string;
}

// ---------------------------------------------------------------------------
// IExporter
// ---------------------------------------------------------------------------

export interface IExporter {
  readonly format: string;

  /**
   * Export a batch of records.
   * Returns Err only for I/O / serialisation failures.
   */
  export(
    records: readonly BusinessRecord[],
    destination: string,
  ): Promise<Result<ExportResult, ExportError>>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type ExportErrorCode =
  | "SERIALIZATION_FAILED"
  | "WRITE_FAILED"
  | "EMPTY_BATCH"
  | "INVALID_DESTINATION";

export interface ExportError {
  readonly code: ExportErrorCode;
  readonly format: string;
  readonly message: string;
  readonly cause?: unknown;
}
