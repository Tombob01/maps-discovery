/**
 * @module core/types/common
 * Primitive value types shared across all modules.
 * No logic. No imports from sibling modules.
 */
declare const __brand: unique symbol;
/**
 * Branded type utility — prevents accidental structural compatibility
 * between semantically different string/number aliases.
 *
 * @example
 * type UserId   = Brand<string, "UserId">;
 * type RunId    = Brand<string, "RunId">;
 * const uid: UserId = "x" as UserId;
 * const rid: RunId  = uid; // ← compile error
 */
export type Brand<T, TBrand extends string> = T & {
    readonly [__brand]: TBrand;
};
export type UUID = Brand<string, "UUID">;
export type ISODate = Brand<string, "ISODate">;
export type E164Phone = Brand<string, "E164Phone">;
export type Fingerprint = Brand<string, "Fingerprint">;
export type ProviderID = Brand<string, "ProviderID">;
export type RunID = Brand<string, "RunID">;
export type QueryID = Brand<string, "QueryID">;
export type BusinessID = Brand<string, "BusinessID">;
/**
 * Deterministic, content-addressable hash of a canonical query.
 *
 * Derived from: canonical(rawText) + providerId + canonical(geoTarget).
 * Used for:
 *   - Cache lookup (skip re-generating already-known queries)
 *   - Queue idempotency keys (BullMQ jobId)
 *   - Cross-run deduplication of identical queries
 *   - Stable identity independent of QueryID (which is run-scoped)
 *
 * Format: hex-encoded SHA-256 (64 characters).
 * Generated exclusively by IQueryCanonicalizer — never set manually.
 */
export type QueryHash = Brand<string, "QueryHash">;
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}
export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}
export type Result<T, E = Error> = Ok<T> | Err<E>;
export declare function ok<T>(value: T): Ok<T>;
export declare function err<E>(error: E): Err<E>;
export declare function isOk<T, E>(r: Result<T, E>): r is Ok<T>;
export declare function isErr<T, E>(r: Result<T, E>): r is Err<E>;
export interface Some<T> {
    readonly some: true;
    readonly value: T;
}
export interface None {
    readonly some: false;
}
export type Option<T> = Some<T> | None;
export declare const NONE: None;
export declare function some<T>(value: T): Some<T>;
export declare function isSome<T>(o: Option<T>): o is Some<T>;
export declare function isNone<T>(o: Option<T>): o is None;
export type NormalizationStatus = "pending" | "complete" | "failed" | "skipped";
export type DeduplicationStatus = "pending" | "unique" | "duplicate" | "uncertain";
export type ExportStatus = "pending" | "exported" | "excluded";
export type RunStatus = "pending" | "running" | "paused" | "complete" | "failed" | "cancelled";
export type QueryStatus = "pending" | "dispatched" | "complete" | "failed" | "skipped";
/**
 * Fine-grained lifecycle state of a single query within the pipeline.
 *
 * Distinct from QueryStatus (the coarse DB/queue column) in both
 * granularity and semantics:
 *
 *   QueryStatus     — persisted, queue-visible, updated by workers
 *   QueryLifecycleState — in-process, used by the query-engine and
 *                         coordinator for flow control and observability
 *
 * Valid forward transitions (no backward transitions are permitted):
 *
 *   generated
 *     └─► canonicalized
 *           └─► queued
 *                 └─► dispatched
 *                       └─► running
 *                             ├─► complete
 *                             ├─► failed
 *                             └─► skipped
 *
 * Transitions to `failed` or `skipped` are terminal from any state.
 * `skipped` is used for duplicates (isDuplicateOfExisting=true) and
 * for queries dropped by maxVariants / maxResults limits.
 */
export type QueryLifecycleState = "generated" | "canonicalized" | "queued" | "dispatched" | "running" | "complete" | "failed" | "skipped";
export type StageCheckpointStatus = "started" | "complete" | "failed" | "skipped";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type PriceLevel = 1 | 2 | 3 | 4;
export type ExportFormat = "csv" | "json" | "jsonl" | "postgres";
/** Makes all properties of T and its nested objects deeply readonly. */
export type DeepReadonly<T> = T extends (infer R)[] ? readonly DeepReadonly<R>[] : T extends object ? {
    readonly [K in keyof T]: DeepReadonly<T[K]>;
} : T;
/** Require at least one key from K to be present on T. */
export type RequireAtLeastOne<T, K extends keyof T = keyof T> = Omit<T, K> & {
    [P in K]-?: Required<Pick<T, P>> & Partial<Pick<T, Exclude<K, P>>>;
}[K];
/** Nominal record with a string key index, values may be undefined. */
export type StringRecord = Readonly<Record<string, string | undefined>>;
export {};
//# sourceMappingURL=common.d.ts.map