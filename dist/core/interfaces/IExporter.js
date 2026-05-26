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
export {};
//# sourceMappingURL=IExporter.js.map