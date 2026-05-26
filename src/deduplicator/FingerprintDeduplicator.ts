/**
 * @module deduplicator/FingerprintDeduplicator
 *
 * In-memory deduplication using BusinessRecord.fingerprint.
 *
 * Strategy:
 *   - Maintain a Map<fingerprint, canonicalFingerprint> of seen records.
 *   - If fingerprint not seen â†’ "unique", register it.
 *   - If fingerprint seen â†’ "duplicate", return the canonical fingerprint.
 *
 * Thread-safety: single-process async only (no distributed locking).
 * For distributed use, back the store with Redis or a DB instead.
 */

import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
import { ok, err } from "../core/types/common.js";
import type {
  IDeduplicator,
  DeduplicationResult,
  DeduplicationError,
} from "./IDeduplicator.js";

export interface FingerprintDeduplicatorOptions {
  /**
   * Optional initial set of known fingerprints (e.g. loaded from DB on startup).
   * Each entry maps fingerprint â†’ canonical fingerprint (itself on first insertion).
   */
  readonly initialFingerprints?: ReadonlyMap<string, string>;
}

export class FingerprintDeduplicator implements IDeduplicator {
  /** fingerprint â†’ canonical fingerprint (itself when first seen) */
  private readonly store: Map<string, string>;

  constructor(options: FingerprintDeduplicatorOptions = {}) {
    this.store = options.initialFingerprints
      ? new Map(options.initialFingerprints)
      : new Map<string, string>();
  }

  async classify(
    record: BusinessRecord,
  ): Promise<Result<DeduplicationResult, DeduplicationError>> {
    const fp = record.fingerprint as string;

    if (!fp || fp.trim() === "") {
      return err({
        code: "INVALID_RECORD",
        message: "BusinessRecord.fingerprint is empty â€” cannot deduplicate",
      });
    }

    const canonical = this.store.get(fp);

    if (canonical === undefined) {
      // First time we see this fingerprint â€” mark as unique
      this.store.set(fp, fp);
      return ok({
        verdict: "unique",
        reason: "No matching fingerprint found in store",
      });
    }

    return ok({
      verdict: "duplicate",
      canonicalFingerprint: canonical,
      reason: `Duplicate of fingerprint ${canonical}`,
    });
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Expose the underlying store for persistence (e.g. flushing to DB).
   * Returns a snapshot â€” mutations do not affect the internal store.
   */
  snapshot(): ReadonlyMap<string, string> {
    return new Map(this.store);
  }

  /** Remove a fingerprint from the store (e.g. for testing or corrections). */
  forget(fingerprint: string): void {
    this.store.delete(fingerprint);
  }

  /** Clear the store. */
  clear(): void {
    this.store.clear();
  }
}
