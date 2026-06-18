/**
 * @module queue/IQueue
 *
 * Generic job queue contract.
 *
 * Producers call enqueue(); consumers call dequeue() / ack() / nack().
 * The queue is typed by payload T so each stage has its own strongly-typed
 * queue instance.
 *
 * Delivery semantics: at-least-once. Consumers must be idempotent.
 */

import type { Result } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Job envelope
// ---------------------------------------------------------------------------

export interface Job<T> {
  readonly id: string;
  readonly queue: string;
  readonly payload: T;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly enqueuedAt: Date;
  /** Set by the queue implementation when dequeued. */
  readonly dequeuedAt?: Date;
}

// ---------------------------------------------------------------------------
// Enqueue options
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  /** Delay in ms before the job becomes visible. Default: 0. */
  readonly delayMs?: number;
  /** Max delivery attempts before the job is dead-lettered. Default: 3. */
  readonly maxAttempts?: number;
  /** Deduplicate: if a job with this key is already queued, skip. */
  readonly dedupeKey?: string;
}

// ---------------------------------------------------------------------------
// Nack outcome
// ---------------------------------------------------------------------------

/**
 * Authoritative result of a nack() call, reported by the queue itself.
 * Consumers (e.g. PipelineRunner) must use this rather than inferring
 * dead-letter status from Job<T>.attempts/maxAttempts, since queue
 * implementations differ on whether attempts is pre- or post-incremented
 * at dequeue time.
 */
export type NackOutcome =
  | "retried"
  | "dead-lettered";

// ---------------------------------------------------------------------------
// IQueue
// ---------------------------------------------------------------------------

export interface IQueue<T> {
  readonly name: string;

  /** Add a job to the queue. Returns the job id. */
  enqueue(
    payload: T,
    options?: EnqueueOptions,
  ): Promise<Result<string, QueueError>>;

  /**
   * Dequeue the next available job.
   * Returns null if the queue is empty.
   */
  dequeue(): Promise<Result<Job<T> | null, QueueError>>;

  /**
   * Acknowledge successful processing — removes the job.
   */
  ack(jobId: string): Promise<Result<void, QueueError>>;

  /**
   * Negative-acknowledge — returns the job to the queue for retry,
   * or moves it to dead-letter if maxAttempts is reached. The returned
   * NackOutcome authoritatively reports which of the two occurred.
   */
  nack(jobId: string, reason?: string): Promise<Result<NackOutcome, QueueError>>;

  /** Number of jobs currently in the queue (visible + invisible). */
  depth(): Promise<Result<number, QueueError>>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type QueueErrorCode =
  | "ENQUEUE_FAILED"
  | "DEQUEUE_FAILED"
  | "ACK_FAILED"
  | "NACK_FAILED"
  | "JOB_NOT_FOUND"
  | "QUEUE_FULL";

export interface QueueError {
  readonly code: QueueErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
