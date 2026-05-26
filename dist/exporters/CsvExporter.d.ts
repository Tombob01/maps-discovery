/**
 * @module exporters/CsvExporter
 *
 * Exports BusinessRecords as RFC-4180 CSV.
 * Uses the same WriteAdapter pattern as JsonLinesExporter.
 */
import type { IExporter, ExportResult, ExportError } from "./IExporter.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
import type { WriteAdapter } from "./JsonLinesExporter.js";
export declare class CsvExporter implements IExporter {
    private readonly write;
    readonly format = "csv";
    constructor(write: WriteAdapter);
    export(records: readonly BusinessRecord[], destination: string): Promise<Result<ExportResult, ExportError>>;
}
//# sourceMappingURL=CsvExporter.d.ts.map