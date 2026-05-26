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
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";

interface InternalJob<T> {
  job: Job<T>;
  visible: boolean; // false while being processed
  deadLetter: boolean;
}

let globalSeq = 0;
function nextId(queueName: string): string {
  return `${queueName}-${++globalSeq}-${Date.now()}`;
}

export interface InMemoryQueueOptions {
  /** Hard limit on total jobs (visible + invisible). Default: unlimited. */
  readonly maxDepth?: number;
  /** Default max delivery attempts for newly enqueued jobs. Default: 3. */
  readonly defaultMaxAttempts?: number;
}

export class InMemoryQueue<T> implements IQueue<T> {
  private readonly jobs = new Map<string, InternalJob<T>>();
  private readonly dedupeKeys = new Set<string>();
  private readonly maxDepth: number;
  private readonly defaultMaxAttempts: number;

  constructor(
    readonly name: string,
    options: InMemoryQueueOptions = {},
  ) {
    this.maxDepth = options.maxDepth ?? Infinity;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
  }

  async enqueue(
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<Result<string, QueueError>> {
    // Depth check
    if (this.jobs.size >= this.maxDepth) {
      return err({
        code: "QUEUE_FULL",
        message: `Queue "${this.name}" is at capacity (${this.maxDepth})`,
      });
    }

    // Deduplication
    if (options.dedupeKey !== undefined) {
      if (this.dedupeKeys.has(options.dedupeKey)) {
        // Already queued — return a sentinel id signalling "skipped"
        return ok(`dedupe-skipped:${options.dedupeKey}`);
      }
      this.dedupeKeys.add(options.dedupeKey);
    }

    const id = nextId(this.name);
    const job: Job<T> = {
      id,
      queue: this.name,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
      enqueuedAt: new Date(),
    };

    this.jobs.set(id, { job, visible: true, deadLetter: false });
    return ok(id);
  }

  async dequeue(): Promise<Result<Job<T> | null, QueueError>> {
    // Find oldest visible job (insertion order via Map iteration)
    for (const [id, internal] of this.jobs) {
      if (internal.visible && !internal.deadLetter) {
        const updated: Job<T> = {
          ...internal.job,
          attempts: internal.job.attempts + 1,
          dequeuedAt: new Date(),
        };
        this.jobs.set(id, { ...internal, job: updated, visible: false });
        return ok(updated);
      }
    }
    return ok(null);
  }

  async ack(jobId: string): Promise<Result<void, QueueError>> {
    const internal = this.jobs.get(jobId);
    if (!internal) {
      return err({
        code: "JOB_NOT_FOUND",
        message: `Job "${jobId}" not found in queue "${this.name}"`,
      });
    }
    // Remove dedupe key so same payload can be re-enqueued later if needed
    // (we don't track which key belongs to which job here, so we leave it —
    //  callers that need re-enqueue should use a new dedupeKey)
    this.jobs.delete(jobId);
    return ok(undefined);
  }

  async nack(
    jobId: string,
    reason?: string,
  ): Promise<Result<void, QueueError>> {
    const internal = this.jobs.get(jobId);
    if (!internal) {
      return err({
        code: "JOB_NOT_FOUND",
        message: `Job "${jobId}" not found in queue "${this.name}"`,
      });
    }

    if (internal.job.attempts >= internal.job.maxAttempts) {
      // Dead-letter it
      this.jobs.set(jobId, { ...internal, visible: false, deadLetter: true });
    } else {
      // Return to queue
      this.jobs.set(jobId, { ...internal, visible: true });
    }

    void reason; // available for logging in richer implementations
    return ok(undefined);
  }

  async depth(): Promise<Result<number, QueueError>> {
    let count = 0;
    for (const internal of this.jobs.values()) {
      if (!internal.deadLetter) count++;
    }
    return ok(count);
  }

  /** Number of dead-lettered jobs. */
  get deadLetterCount(): number {
    let count = 0;
    for (const internal of this.jobs.values()) {
      if (internal.deadLetter) count++;
    }
    return count;
  }

  /** Drain all jobs (for testing). */
  clear(): void {
    this.jobs.clear();
    this.dedupeKeys.clear();
  }
}
