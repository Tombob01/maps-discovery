/**
 * @module core/models/Job
 *
 * Pipeline job envelope models and run metadata.
 * These are the shapes that travel through BullMQ queues.
 * They are pure data — no methods, no queue-framework types.
 */

import type { QuerySeed, RunConfig } from "./Query.js";
import type {
  BusinessID,
  ExportFormat,
  QueryHash,
  QueryID,
  RunID,
  StageCheckpointStatus,
  UUID,
  RunStatus,
} from "../types/common.js";
import type { ResumeToken } from "../types/pagination.js";

// ---------------------------------------------------------------------------
// Queue names — single source of truth
// ---------------------------------------------------------------------------

export type QueueName =
  | "query:generate"
  | "query:expand"
  | "discovery"
  | "normalization"
  | "proposal-production"
  | "deduplication"
  | "export";

// ---------------------------------------------------------------------------
// Stage names — mirrors QueueName but used in checkpoint records
// ---------------------------------------------------------------------------

export type StageName = QueueName;

// ---------------------------------------------------------------------------
// Job payload types — one per queue
// ---------------------------------------------------------------------------

export interface QueryGenerationJobPayload {
  readonly runId: RunID;
  readonly seed: QuerySeed;
}

export interface QueryExpansionJobPayload {
  readonly runId: RunID;
  readonly queryId: QueryID;
  readonly providerId: string;
  /**
   * Carried from GeneratedQuery.queryHash.
   * Used as the BullMQ jobId to guarantee at-most-once enqueue semantics:
   * if the same query is produced again (e.g. on retry), BullMQ will
   * reject the duplicate job rather than processing it twice.
   */
  readonly queryHash: QueryHash;
}

export interface DiscoveryJobPayload {
  readonly runId: RunID;
  readonly queryId: QueryID;
  readonly providerId: string;
  /**
   * Carried from GeneratedQuery.queryHash.
   * Used as the BullMQ jobId for the same idempotency guarantee as above.
   * On paginated runs a page suffix is appended: `${queryHash}:page:${n}`.
   */
  readonly queryHash: QueryHash;
  /**
   * Opaque resume token. If present, the worker resumes pagination
   * from the stored page rather than starting from page 1.
   */
  readonly resumeToken?: ResumeToken;
}

export interface NormalizationJobPayload {
  readonly runId: RunID;
  readonly queryId: QueryID;
  readonly rawResultId: string;
  readonly providerId: string;
}

export interface ProposalProductionJobPayload {
  readonly runId: RunID;
  readonly queryId: QueryID;
  readonly rawResultId: UUID;
  readonly providerId: string;
}

export interface DeduplicationJobPayload {
  readonly runId: RunID;
  readonly businessRecordId: BusinessID;
}

export interface ExportJobPayload {
  readonly runId: RunID;
  readonly businessRecordId: BusinessID;
  readonly exportFormat: ExportFormat;
  readonly destination: string;
}

/** Discriminated union of all possible job payloads. */
export type JobPayload =
  | QueryGenerationJobPayload
  | QueryExpansionJobPayload
  | DiscoveryJobPayload
  | NormalizationJobPayload
  | ProposalProductionJobPayload
  | DeduplicationJobPayload
  | ExportJobPayload;

// ---------------------------------------------------------------------------
// Stage result — returned by each stage's process() method
// ---------------------------------------------------------------------------

export interface StageResult {
  /** Whether the stage completed successfully. */
  readonly success: boolean;

  /** IDs of jobs enqueued into the next queue (if any). */
  readonly outputJobIds?: readonly string[];

  /** True if the item was intentionally skipped (not an error). */
  readonly skipped?: boolean;

  /** Human-readable reason for the skip, if applicable. */
  readonly skipReason?: string;

  /** Arbitrary diagnostic metadata for logging/monitoring. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Stage checkpoint — persisted in the DB for resumability
// ---------------------------------------------------------------------------

/**
 * Written to the `stage_checkpoints` table by each worker.
 * One row per (runId, stage, entityId) — unique constraint enforced by DB.
 */
export interface StageCheckpoint {
  readonly id: UUID;
  readonly runId: RunID;
  readonly stage: StageName;
  /**
   * The entity this checkpoint tracks.
   * Semantics depend on stage:
   *   query:generate   → seed hash (synthetic)
   *   query:expand     → QueryID
   *   discovery        → QueryID
   *   normalization    → raw_result UUID
   *   deduplication    → BusinessID
   *   export           → BusinessID
   */
  readonly entityId: string;
  readonly status: StageCheckpointStatus;
  readonly error?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Run metadata
// ---------------------------------------------------------------------------

export type { RunStatus, StageCheckpointStatus } from "../types/common.js";

export interface Run {
  readonly id: RunID;
  readonly status: RunStatus;
  readonly config: RunConfig;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  /** Aggregate counters — updated periodically by the coordinator. */
  readonly stats: RunStats;
}

export interface RunStats {
  readonly queriesGenerated: number;
  readonly queriesDispatched: number;
  readonly rawResultsFound: number;
  readonly recordsNormalized: number;
  readonly recordsUnique: number;
  readonly recordsDuplicate: number;
  readonly recordsExported: number;
  readonly errors: number;
}
