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

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

interface BusinessRecordRow extends Row {
  id: string;
  fingerprint: string;
  external_ids: ExternalIdMap;

  name: string;
  normalized_name: string;

  address: Address;
  geo_lat: number | null;
  geo_lng: number | null;

  phone: string | null;
  normalized_phone: string | null;
  website: string | null;

  categories: string[];
  primary_category: string | null;

  rating: number | null;
  review_count: number | null;

  hours: StoredHours | null;
  price_level: number | null;

  source_provider: string;
  source_url: string | null;
  collected_at: Date;
  run_id: string;
  query_id: string;

  normalization_status: string;
  deduplication_status: string;
  export_status: string;
}

// hours stored as JSONB — mirrors BusinessHours but with mutable raw array
interface StoredHours {
  raw: string[];
  parsed: DayHours[] | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: BusinessRecordRow): BusinessRecord {
  let geo: GeoCoordinates | null = null;
  if (row.geo_lat !== null && row.geo_lng !== null) {
    geo = { lat: row.geo_lat, lng: row.geo_lng };
  }

  let hours: BusinessHours | null = null;
  if (row.hours !== null) {
    hours = {
      raw: row.hours.raw,
      parsed: row.hours.parsed,
    };
  }

  return {
    id: row.id as BusinessID,
    fingerprint: row.fingerprint as Fingerprint,
    externalIds: row.external_ids,

    name: row.name,
    normalizedName: row.normalized_name,

    address: row.address,
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
    r.id,
    r.fingerprint,
    JSON.stringify(r.externalIds),
    r.name,
    r.normalizedName,
    JSON.stringify(r.address),
    r.geo?.lat ?? null,
    r.geo?.lng ?? null,
    r.phone ?? null,
    r.normalizedPhone ?? null,
    r.website ?? null,
    r.categories,
    r.primaryCategory ?? null,
    r.rating ?? null,
    r.reviewCount ?? null,
    r.hours !== null ? JSON.stringify(r.hours) : null,
    r.priceLevel ?? null,
    r.sourceProvider,
    r.sourceUrl ?? null,
    r.collectedAt,
    r.runId,
    r.queryId,
    r.normalizationStatus,
    r.deduplicationStatus,
    r.exportStatus,
  ];
}

const INSERT_COLUMNS = `
  id, fingerprint, external_ids,
  name, normalized_name,
  address, geo_lat, geo_lng,
  phone, normalized_phone, website,
  categories, primary_category,
  rating, review_count,
  hours, price_level,
  source_provider, source_url, collected_at,
  run_id, query_id,
  normalization_status, deduplication_status, export_status
`.trim();

// 25 columns per row
const COLUMNS_PER_ROW = 25;

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
    await this.db.query(
      `INSERT INTO business_records (${INSERT_COLUMNS})
       VALUES (${rowPlaceholders(1)})
       ON CONFLICT (id) DO NOTHING`,
      recordToParams(record),
    );
  }

  // ---------------------------------------------------------------------------
  // insertMany — single multi-row INSERT for efficiency
  // ---------------------------------------------------------------------------

  async insertMany(records: readonly BusinessRecord[]): Promise<void> {
    if (records.length === 0) return;

    const params: unknown[] = [];
    const valueClauses: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record === undefined) continue;
      const startIdx = i * COLUMNS_PER_ROW + 1;
      valueClauses.push(`(${rowPlaceholders(startIdx)})`);
      params.push(...recordToParams(record));
    }

    await this.db.query(
      `INSERT INTO business_records (${INSERT_COLUMNS})
       VALUES ${valueClauses.join(", ")}
       ON CONFLICT (id) DO NOTHING`,
      params,
    );
  }

  // ---------------------------------------------------------------------------
  // getByRunId
  // ---------------------------------------------------------------------------

  async getByRunId(runId: string): Promise<readonly BusinessRecord[]> {
    const { rows } = await this.db.query<BusinessRecordRow>(
      `SELECT *
         FROM business_records
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
         FROM business_records
        WHERE run_id = $1`,
      [runId],
    );
    const row = rows[0];
    return row !== undefined ? parseInt(row.count, 10) : 0;
  }
}
