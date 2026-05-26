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
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Serialisation shape — flattens nested objects for consumer convenience
// ---------------------------------------------------------------------------

interface ExportedRecord {
  id: string;
  name: string;
  normalizedName: string;
  phone: string | null;
  normalizedPhone: string | null;
  website: string | null;
  addressRaw: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  primaryCategory: string | null;
  categories: string[];
  sourceProvider: string;
  sourceUrl: string | null;
  collectedAt: string; // ISO 8601
  runId: string;
  queryId: string;
  googlePlaceId: string | null;
}

function toExportShape(r: BusinessRecord): ExportedRecord {
  return {
    id: r.id as string,
    name: r.name,
    normalizedName: r.normalizedName,
    phone: r.phone,
    normalizedPhone: r.normalizedPhone as string | null,
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
    runId: r.runId as string,
    queryId: r.queryId as string,
    googlePlaceId: r.externalIds.googlePlaceId ?? null,
  };
}

// ---------------------------------------------------------------------------
// WriteAdapter — injected for testability
// ---------------------------------------------------------------------------

export type WriteAdapter = (
  destination: string,
  content: string,
) => Promise<void>;

// ---------------------------------------------------------------------------
// JsonLinesExporter
// ---------------------------------------------------------------------------

export class JsonLinesExporter implements IExporter {
  readonly format = "jsonl";

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
      content =
        records.map((r) => JSON.stringify(toExportShape(r))).join("\n") + "\n";
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
