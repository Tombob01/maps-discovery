/**
 * @module core/interfaces/IPipelineStage
 *
 * Pipeline stage contract — the interface every stage worker must implement.
 *
 * Stages are independently runnable, restartable, and decoupled.
 * A stage worker:
 *   1. Reads a job from its inputQueue
 *   2. Calls process()
 *   3. On success, enqueues outputJobIds into outputQueue
 *   4. On failure, calls onFailed() — BullMQ handles retry scheduling
 *
 * The stage itself never touches BullMQ types — those live in the
 * pipeline/workers layer. This interface is purely domain-level.
 */
import type { StageResult, StageCheckpoint, QueueName, StageName, JobPayload } from "../models/Job.js";
import type { RunID, Result, StageCheckpointStatus } from "../types/common.js";
export interface StageMetadata {
    readonly stageName: StageName;
    readonly inputQueue: QueueName;
    /**
     * Queue that this stage enqueues into on success.
     * null for terminal stages (e.g. export).
     */
    readonly outputQueue: QueueName | null;
}
/**
 * TPayload is one of the JobPayload variants matching this stage's queue.
 * Typed at the worker level, not here, to keep core free of queue concerns.
 */
export interface IPipelineStage<TPayload extends JobPayload> {
    readonly metadata: StageMetadata;
    /**
     * Processes a single job.
     *
     * Must be idempotent: if called twice with the same job, the second
     * call must produce the same result without creating duplicate records.
     *
     * Returns:
     *   - StageResult with success=true    → worker enqueues output jobs
     *   - StageResult with success=false   → worker calls onFailed
     *   - StageResult with skipped=true    → treated as success, no output jobs
     *
     * Must not throw — unhandled exceptions bypass the onFailed hook.
     */
    process(payload: TPayload, jobId: string, attemptNumber: number): Promise<StageResult>;
    /**
     * Called when a job has exhausted all retry attempts.
     * Used for alerting, dead-letter queue routing, or audit logging.
     * Must not throw.
     */
    onFailed(payload: TPayload, jobId: string, error: Error): Promise<void>;
    /**
     * Called when BullMQ marks a job as stalled (worker died mid-processing).
     * Used for checkpoint cleanup or state reconciliation.
     * Must not throw.
     */
    onStalled(payload: TPayload, jobId: string): Promise<void>;
}
export interface IStageCheckpointStore {
    /**
     * Writes or upserts a checkpoint.
     * On conflict (same runId + stage + entityId), updates status and metadata.
     */
    upsert(checkpoint: Omit<StageCheckpoint, "id" | "createdAt">): Promise<Result<StageCheckpoint>>;
    /** Reads the current checkpoint for a (runId, stage, entityId) triple. */
    get(runId: RunID, stage: StageName, entityId: string): Promise<Result<StageCheckpoint | null>>;
    /**
     * Returns all checkpoints for a run+stage with the given status.
     * Used on startup to resume incomplete work.
     */
    getByStatus(runId: RunID, stage: StageName, status: StageCheckpointStatus): Promise<Result<readonly StageCheckpoint[]>>;
}
//# sourceMappingURL=IPipelineStage.d.ts.map