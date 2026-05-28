/**
 * @module storage/PostgresRecordRepository
 *
 * Postgres-backed implementation of IRecordStore.
 *
 * Serialisation strategy
 *   • Nested objects (address, hours, externalIds) → JSONB
 *   • Branded string IDs → TEXT  (brands are erased at runtime)
 *   • Arrays (categories) → TEXT[]  via Postgres array literal
 *   • geo split into geo_lat / geo_lng columns for spatial indexing readiness
 *   • All timestamps → TIMESTAMPTZ (pg driver returns native Date)
 *
 * insertMany uses a single multi-row INSERT for efficiency.
 * pg parameterised queries are used throughout — no string interpolation.
 */

import type {
  BusinessRecord,
  BusinessHours,
  DayHours,
  ExternalIdMap,
} from "../core/models/BusinessRecord.js";
import type { Address, GeoCoordinates } from "../core/types/geo.js";
import type {
  BusinessID,
  DeduplicationStatus,
  E164Phone,
  ExportStatus,
  Fingerprint,
  NormalizationStatus,
  PriceLevel,
  QueryID,
  RunID,
} from "../core/types/common.js";
import type { IRecordStore } from "./IRecordStore.js";
import type { PostgresClient, Row } from "./PostgresClient.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

interface BusinessRecordRow extends Row {
  id: string;
  fingerprint: string;
  external_ids: ExternalIdMap;
  run_id: string;
  query_id: string;
  source_provider: string;
  name: string;
  normalized_name: string;
  phone: string | null;
  normalized_phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  price_level: number | null;
  primary_category: string | null;
  categories: string[];
  address_raw: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  address_country_code: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  hours_raw: string[] | null;
  hours_parsed: DayHours[] | null;
  source_url: string | null;
  collected_at: Date;
  normalization_status: string;
  deduplication_status: string;
  export_status: string;
}


// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: BusinessRecordRow): BusinessRecord {
  const geo: GeoCoordinates | null =
    row.geo_lat !== null && row.geo_lng !== null
      ? { lat: row.geo_lat, lng: row.geo_lng }
      : null;

  const hours: BusinessHours | null =
    row.hours_raw !== null
      ? { raw: row.hours_raw, parsed: row.hours_parsed ?? null }
      : null;

  const address: Address = {
    raw: row.address_raw ?? "",
    street: row.address_street,
    city: row.address_city,
    state: row.address_state,
    postalCode: row.address_postal_code,
    country: row.address_country,
    countryCode: row.address_country_code,
  };

  return {
    id: row.id as BusinessID,
    fingerprint: row.fingerprint as Fingerprint,
    externalIds: row.external_ids,
    name: row.name,
    normalizedName: row.normalized_name,
    address,
    geo,
    phone: row.phone,
    normalizedPhone: row.normalized_phone as E164Phone | null,
    website: row.website,
    categories: row.categories,
    primaryCategory: row.primary_category,
    rating: row.rating,
    reviewCount: row.review_count,
    hours,
    priceLevel: row.price_level as PriceLevel | null,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    collectedAt: row.collected_at,
    runId: row.run_id as RunID,
    queryId: row.query_id as QueryID,
    normalizationStatus: row.normalization_status as NormalizationStatus,
    deduplicationStatus: row.deduplication_status as DeduplicationStatus,
    exportStatus: row.export_status as ExportStatus,
  };
}

/** Flatten a BusinessRecord into the ordered parameter list for INSERT. */
function recordToParams(r: BusinessRecord): unknown[] {
  return [
    randomUUID(),
    r.fingerprint,
    JSON.stringify(r.externalIds),
    r.runId,
    null,                                              // query_id — not persisted yet; FK stays, nullable
    null,                                              // raw_result_id — not wired yet
    r.sourceProvider,
    r.name,
    r.normalizedName,
    r.phone ?? null,
    r.normalizedPhone ?? null,
    r.website ?? null,
    r.rating ?? null,
    r.reviewCount ?? null,
    r.priceLevel ?? null,
    r.primaryCategory ?? null,
    r.categories,
    r.address.raw,
    r.address.street ?? null,
    r.address.city ?? null,
    r.address.state ?? null,
    r.address.postalCode ?? null,
    r.address.country ?? null,
    r.address.countryCode ?? null,
    r.geo?.lat ?? null,
    r.geo?.lng ?? null,
    r.hours?.raw ?? null,
    r.hours?.parsed ? JSON.stringify(r.hours.parsed) : null,
    r.sourceUrl ?? null,
    r.collectedAt,
    r.normalizationStatus,
    r.deduplicationStatus,
    r.exportStatus,
  ];
}

const INSERT_COLUMNS = `
  id, fingerprint, external_ids,
  run_id, query_id, raw_result_id,
  source_provider,
  name, normalized_name,
  phone, normalized_phone, website,
  rating, review_count, price_level,
  primary_category, categories,
  address_raw, address_street, address_city, address_state,
  address_postal_code, address_country, address_country_code,
  geo_lat, geo_lng,
  hours_raw, hours_parsed,
  source_url, collected_at,
  normalization_status, deduplication_status, export_status
`.trim();

// 25 columns per row
const COLUMNS_PER_ROW = 33;

/** Build "$1,$2,...$25" placeholder string for one row, offset by startIdx. */
function rowPlaceholders(startIdx: number): string {
  return Array.from(
    { length: COLUMNS_PER_ROW },
    (_, i) => `$${startIdx + i}`,
  ).join(", ");
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PostgresRecordRepository implements IRecordStore {
  private readonly db: PostgresClient;

  constructor(db: PostgresClient) {
    this.db = db;
  }

  // ---------------------------------------------------------------------------
  // insert
  // ---------------------------------------------------------------------------

  async insert(record: BusinessRecord): Promise<void> {
    console.log("[insert] runId:", record.runId, "queryId:", record.queryId, "name:", record.name);
    await this.db.query(
      `INSERT INTO businesses (${INSERT_COLUMNS})
       VALUES (${rowPlaceholders(1)})
       ON CONFLICT (fingerprint) DO NOTHING`,
      recordToParams(record),
    );
  }

  // ---------------------------------------------------------------------------
  // insertMany — single multi-row INSERT for efficiency
  // ---------------------------------------------------------------------------

  async insertMany(records: readonly BusinessRecord[]): Promise<void> {
    console.log("[insertMany] records:", records.length, "first runId:", records[0]?.runId, "first queryId:", records[0]?.queryId);
    if (records.length === 0) return;

    const params: unknown[] = [];
    const valueClauses: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record === undefined) continue;
      const startIdx = i * COLUMNS_PER_ROW + 1;
      valueClauses.push(`(${rowPlaceholders(startIdx)})`);
      params.push(...recordToParams(record));
      const p = recordToParams(record); p.forEach((v,i) => { if (v === "null" || (typeof v === "string" && v.includes("null"))) console.log("[insertMany] NULL STRING at param", i+1, "value:", v); }); console.log("[insertMany] params:", JSON.stringify(p));
    }

    await this.db.query(
      `INSERT INTO businesses (${INSERT_COLUMNS})
       VALUES ${valueClauses.join(", ")}
       ON CONFLICT (fingerprint) DO NOTHING`,
      params,
    );
  }

  // ---------------------------------------------------------------------------
  // getByRunId
  // ---------------------------------------------------------------------------

  async getByRunId(runId: string): Promise<readonly BusinessRecord[]> {
    const { rows } = await this.db.query<BusinessRecordRow>(
      `SELECT *
         FROM businesses
        WHERE run_id = $1
        ORDER BY collected_at ASC`,
      [runId],
    );
    return rows.map(rowToRecord);
  }

  // ---------------------------------------------------------------------------
  // countByRunId
  // ---------------------------------------------------------------------------

  async countByRunId(runId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM businesses
        WHERE run_id = $1`,
      [runId],
    );
    const row = rows[0];
    return row !== undefined ? parseInt(row.count, 10) : 0;
  }
}
