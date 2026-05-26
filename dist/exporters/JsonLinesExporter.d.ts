/**
 * @module exporters/JsonLinesExporter
 *
 * Exports BusinessRecords as JSON Lines (one JSON object per line).
 * Destination is treated as a string key — concrete write behaviour
 * is injected via a WriteAdapter so the exporter stays I/O-agnostic
 * and fully testable without touching the filesystem.
 */
import type { IExporter, ExportResult, ExportError } from "./IExporter.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
export type WriteAdapter = (destination: string, content: string) => Promise<void>;
export declare class JsonLinesExporter implements IExporter {
    private readonly write;
    readonly format = "jsonl";
    constructor(write: WriteAdapter);
    export(records: readonly BusinessRecord[], destination: string): Promise<Result<ExportResult, ExportError>>;
}
//# sourceMappingURL=JsonLinesExporter.d.ts.map