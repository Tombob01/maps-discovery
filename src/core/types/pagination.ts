/**
 * @module core/types/pagination
 * Provider-agnostic pagination primitives.
 *
 * Supports three pagination strategies:
 *   1. Offset/page-number  — classic page=N&size=M
 *   2. Cursor              — opaque string from last response
 *   3. URL                 — next-page URL embedded in response
 *
 * All strategies are expressed through a single discriminated union so
 * consumers can handle any provider without conditional branching.
 */

// ---------------------------------------------------------------------------
// Page request variants
// ---------------------------------------------------------------------------

export interface OffsetPageRequest {
  readonly kind: "offset";
  readonly page: number; // 1-indexed
  readonly pageSize: number;
}

export interface CursorPageRequest {
  readonly kind: "cursor";
  readonly cursor: string; // Opaque — provider-defined
  readonly pageSize?: number;
}

export interface UrlPageRequest {
  readonly kind: "url";
  readonly url: string;
}

export type PageRequest =
  | OffsetPageRequest
  | CursorPageRequest
  | UrlPageRequest;

// ---------------------------------------------------------------------------
// Page response variants
// ---------------------------------------------------------------------------

export interface OffsetPageInfo {
  readonly kind: "offset";
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalPages: number | null; // null if provider doesn't expose it
  readonly totalItems: number | null;
  readonly hasNextPage: boolean;
}

export interface CursorPageInfo {
  readonly kind: "cursor";
  readonly nextCursor: string | null; // null = last page
  readonly hasNextPage: boolean;
}

export interface UrlPageInfo {
  readonly kind: "url";
  readonly nextUrl: string | null; // null = last page
  readonly hasNextPage: boolean;
}

export type PageInfo = OffsetPageInfo | CursorPageInfo | UrlPageInfo;

// ---------------------------------------------------------------------------
// Resume token
// ---------------------------------------------------------------------------

/**
 * Opaque resume token stored in job payload.
 * Serialised to JSON, persisted in Redis/DB, used to restart a
 * discovery job at the exact page it was interrupted on.
 */
export interface ResumeToken {
  /** Which pagination strategy produced this token. */
  readonly strategy: PageRequest["kind"];
  /** Serialised PageRequest — restored verbatim on retry. */
  readonly pageRequest: PageRequest;
  /** Provider-specific context (e.g. session state, search ID). */
  readonly providerContext?: Record<string, unknown>;
  /** UTC epoch ms when the token was created. */
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Paginated result wrapper
// ---------------------------------------------------------------------------

/**
 * Generic wrapper returned by any paginated provider method.
 * TItem is ProviderResult in the discovery context, but the type
 * is intentionally generic for reuse.
 */
export interface PaginatedResult<TItem> {
  readonly items: readonly TItem[];
  readonly pageInfo: PageInfo;
  /** Resume token to persist in the job payload for crash recovery. */
  readonly resumeToken: ResumeToken;
}
