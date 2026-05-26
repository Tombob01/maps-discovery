/**
 * @module exporters/CsvExporter
 *
 * Exports BusinessRecords as RFC-4180 CSV.
 * Uses the same WriteAdapter pattern as JsonLinesExporter.
 */

import type { IExporter, ExportResult, ExportError } from "./IExporter.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";
import type { WriteAdapter } from "./JsonLinesExporter.js";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** RFC-4180: wrap field in quotes if it contains comma, quote, or newline. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const HEADERS = [
  "id",
  "name",
  "normalized_name",
  "phone",
  "normalized_phone",
  "website",
  "address_raw",
  "city",
  "state",
  "postal_code",
  "country",
  "lat",
  "lng",
  "rating",
  "review_count",
  "price_level",
  "primary_category",
  "categories",
  "source_provider",
  "source_url",
  "collected_at",
  "run_id",
  "query_id",
  "google_place_id",
] as const;

function toRow(r: BusinessRecord): string {
  return [
    csvField(r.id as string),
    csvField(r.name),
    csvField(r.normalizedName),
    csvField(r.phone),
    csvField(r.normalizedPhone as string | null),
    csvField(r.website),
    csvField(r.address.raw),
    csvField(r.address.city),
    csvField(r.address.state),
    csvField(r.address.postalCode),
    csvField(r.address.country),
    csvField(r.geo?.lat ?? null),
    csvField(r.geo?.lng ?? null),
    csvField(r.rating),
    csvField(r.reviewCount),
    csvField(r.priceLevel),
    csvField(r.primaryCategory),
    csvField(r.categories.join("|")),
    csvField(r.sourceProvider),
    csvField(r.sourceUrl),
    csvField(r.collectedAt.toISOString()),
    csvField(r.runId as string),
    csvField(r.queryId as string),
    csvField(r.externalIds.googlePlaceId ?? null),
  ].join(",");
}

// ---------------------------------------------------------------------------
// CsvExporter
// ---------------------------------------------------------------------------

export class CsvExporter implements IExporter {
  readonly format = "csv";

  constructor(private readonly write: WriteAdapter) {}

  async export(
    records: readonly BusinessRecord[],
    destination: string,
  ): Promise<Result<ExportResult, ExportError>> {
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

    let content: string;
    try {
      const header = HEADERS.join(",");
      const rows = records.map(toRow).join("\n");
      content = `${header}\n${rows}\n`;
    } catch (e) {
      return err({
        code: "SERIALIZATION_FAILED",
        format: this.format,
        message: `Serialization error: ${String(e)}`,
        cause: e,
      });
    }

    try {
      await this.write(destination, content);
    } catch (e) {
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
