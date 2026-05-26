/**
 * @module queue/InMemoryQueue
 *
 * In-memory IQueue<T> implementation.
 *
 * Suitable for single-process use, tests, and development.
 * For production, swap for a Redis/BullMQ or SQS-backed implementation.
 *
 * Visibility timeout: dequeued jobs become invisible until ack'd/nack'd.
 * Nack'd jobs are re-enqueued (attempt count incremented) or dead-lettered.
 */
import type { IQueue, Job, EnqueueOptions, QueueError } from "./IQueue.js";
import type { Result } from "../core/types/common.js";
export interface InMemoryQueueOptions {
    /** Hard limit on total jobs (visible + invisible). Default: unlimited. */
    readonly maxDepth?: number;
    /** Default max delivery attempts for newly enqueued jobs. Default: 3. */
    readonly defaultMaxAttempts?: number;
}
export declare class InMemoryQueue<T> implements IQueue<T> {
    readonly name: string;
    private readonly jobs;
    private readonly dedupeKeys;
    private readonly maxDepth;
    private readonly defaultMaxAttempts;
    constructor(name: string, options?: InMemoryQueueOptions);
    enqueue(payload: T, options?: EnqueueOptions): Promise<Result<string, QueueError>>;
    dequeue(): Promise<Result<Job<T> | null, QueueError>>;
    ack(jobId: string): Promise<Result<void, QueueError>>;
    nack(jobId: string, reason?: string): Promise<Result<void, QueueError>>;
    depth(): Promise<Result<number, QueueError>>;
    /** Number of dead-lettered jobs. */
    get deadLetterCount(): number;
    /** Drain all jobs (for testing). */
    clear(): void;
}
//# sourceMappingURL=InMemoryQueue.d.ts.map