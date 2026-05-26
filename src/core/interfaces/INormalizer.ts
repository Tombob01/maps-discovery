/**
 * @module core/interfaces/INormalizer
 *
 * Normalizer contracts — ProviderResult → BusinessRecord.
 *
 * The normalizer is stateless: given the same ProviderResult, it must
 * always produce the same BusinessRecord. No DB reads, no queue calls.
 *
 * Architecture:
 *   BusinessNormalizer          orchestrates field normalizers
 *   ├── IFieldNormalizer<Phone> normalizes phone strings → E164Phone
 *   ├── IFieldNormalizer<Address> normalizes address strings → Address
 *   ├── IFieldNormalizer<Hours>  parses hours strings → BusinessHours
 *   └── IProviderMapper          maps provider-specific keys → PartialRawFields
 */

import type { Result } from "../types/common.js";
import type { BusinessRecord } from "../models/BusinessRecord.js";
import type { ProviderResult } from "../models/ProviderResult.js";

// ---------------------------------------------------------------------------
// Normalization context
// ---------------------------------------------------------------------------

export interface NormalizationContext {
  /** Provider that produced the raw result. */
  readonly providerId: string;
  readonly runId: string;
  readonly queryId: string;
  readonly collectedAt: Date;
  /**
   * ISO 3166-1 alpha-2 country code used as a hint for phone normalisation.
   * Derived from the query's GeoTarget.
   */
  readonly countryCodeHint?: string;
}

// ---------------------------------------------------------------------------
// INormalizer — top-level contract
// ---------------------------------------------------------------------------

export interface INormalizer {
  /**
   * Normalises a raw ProviderResult into a BusinessRecord.
   *
   * This is a pure transformation — no side effects.
   * Returns Err if the result is malformed beyond recovery.
   *
   * Partial failures (e.g. phone parsing fails) set the relevant field to
   * null rather than returning Err — callers must check individual fields.
   */
  normalize(
    result: ProviderResult,
    context: NormalizationContext,
  ): Promise<Result<BusinessRecord, NormalizationErrorDetail>>;
}

// ---------------------------------------------------------------------------
// IFieldNormalizer — per-field normalisation unit
// ---------------------------------------------------------------------------

/**
 * Normalises a single raw string value into a typed output.
 * TRaw is typically string | null; TOut is the typed result.
 */
export interface IFieldNormalizer<TRaw, TOut> {
  normalize(
    raw: TRaw,
    context: NormalizationContext,
  ): Result<TOut, FieldNormalizationErrorDetail>;
}

// ---------------------------------------------------------------------------
// IProviderMapper — maps provider-specific raw payload to an intermediate shape
// ---------------------------------------------------------------------------

/**
 * Each provider ships its own IProviderMapper.
 * It translates the opaque `rawPayload` from ProviderResult into a
 * consistent intermediate object (RawFields) that the BusinessNormalizer
 * can process without knowing the provider's field names.
 */
export interface IProviderMapper {
  /** Must match the provider's id field. */
  readonly providerId: string;

  /**
   * Extracts a RawFields object from the untyped raw payload.
   * Returns Err if the payload is structurally invalid.
   */
  extractFields(rawPayload: unknown): Result<RawFields, MappingErrorDetail>;
}

// ---------------------------------------------------------------------------
// RawFields — intermediate shape between mapping and normalisation
// ---------------------------------------------------------------------------

/**
 * All fields optional — the mapper may not be able to extract everything.
 * The normalizer treats missing fields as null in the output BusinessRecord.
 */
export interface RawFields {
  readonly name?: string;
  readonly phone?: string;
  readonly website?: string;
  readonly addressRaw?: string;
  readonly street?: string;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly country?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly rating?: number;
  readonly reviewCount?: number;
  readonly priceLevel?: number;
  readonly categories?: readonly string[];
  readonly hoursRaw?: readonly string[];
  readonly externalIds?: Readonly<Record<string, string>>;
  readonly sourceUrl?: string;
}

// ---------------------------------------------------------------------------
// Error types — NormalizationErrorCode lives in errors/NormalizationError.ts
// ---------------------------------------------------------------------------

export type { NormalizationErrorCode } from "../errors/NormalizationError.js";
import type { NormalizationErrorCode } from "../errors/NormalizationError.js";

export type FieldNormalizationErrorCode =
  | "PARSE_FAILED"
  | "INVALID_FORMAT"
  | "OUT_OF_RANGE"
  | "EMPTY_VALUE";

export type MappingErrorCode =
  | "INVALID_PAYLOAD_SHAPE"
  | "MISSING_REQUIRED_KEY"
  | "UNEXPECTED_TYPE";

export interface NormalizationErrorDetail {
  readonly code: NormalizationErrorCode;
  readonly message: string;
  readonly providerId: string;
  readonly cause?: unknown;
}

export interface FieldNormalizationErrorDetail {
  readonly code: FieldNormalizationErrorCode;
  readonly field: string;
  readonly raw: unknown;
  readonly message: string;
}

export interface MappingErrorDetail {
  readonly code: MappingErrorCode;
  readonly providerId: string;
  readonly message: string;
  readonly cause?: unknown;
}
