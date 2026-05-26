/**
 * @module exporters/JsonLinesExporter
 *
 * Exports BusinessRecords as JSON Lines (one JSON object per line).
 * Destination is treated as a string key — concrete write behaviour
 * is injected via a WriteAdapter so the exporter stays I/O-agnostic
 * and fully testable without touching the filesystem.
 */
import { ok, err } from "../core/types/common.js";
function toExportShape(r) {
    return {
        id: r.id,
        name: r.name,
        normalizedName: r.normalizedName,
        phone: r.phone,
        normalizedPhone: r.normalizedPhone,
        website: r.website,
        addressRaw: r.address.raw,
        city: r.address.city,
        state: r.address.state,
        postalCode: r.address.postalCode,
        country: r.address.country,
        lat: r.geo?.lat ?? null,
        lng: r.geo?.lng ?? null,
        rating: r.rating,
        reviewCount: r.reviewCount,
        priceLevel: r.priceLevel,
        primaryCategory: r.primaryCategory,
        categories: [...r.categories],
        sourceProvider: r.sourceProvider,
        sourceUrl: r.sourceUrl,
        collectedAt: r.collectedAt.toISOString(),
        runId: r.runId,
        queryId: r.queryId,
        googlePlaceId: r.externalIds.googlePlaceId ?? null,
    };
}
// ---------------------------------------------------------------------------
// JsonLinesExporter
// ---------------------------------------------------------------------------
export class JsonLinesExporter {
    write;
    format = "jsonl";
    constructor(write) {
        this.write = write;
    }
    async export(records, destination) {
        if (records.length === 0) {
            return err({
                code: "EMPTY_BATCH",
                format: this.format,
                message: "No records to export",
            });
        }
        if (!destination || destination.trim() === "") {
            return err({
                code: "INVALID_DESTINATION",
                format: this.format,
                message: "Destination must not be empty",
            });
        }
        let content;
        try {
            content =
                records.map((r) => JSON.stringify(toExportShape(r))).join("\n") + "\n";
        }
        catch (e) {
            return err({
                code: "SERIALIZATION_FAILED",
                format: this.format,
                message: `Serialization error: ${String(e)}`,
                cause: e,
            });
        }
        try {
            await this.write(destination, content);
        }
        catch (e) {
            return err({
                code: "WRITE_FAILED",
                format: this.format,
                message: `Write to "${destination}" failed: ${String(e)}`,
                cause: e,
            });
        }
        return ok({
            recordsWritten: records.length,
            destination,
            format: this.format,
        });
    }
}
//# sourceMappingURL=JsonLinesExporter.js.map