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
export {};
//# sourceMappingURL=IExporter.js.map