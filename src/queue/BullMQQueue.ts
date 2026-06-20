/**
 * @module queue/BullMQQueue
 *
 * BullMQ-backed IQueue<T> implementation using BullMQ's manual-processing
 * mode (Worker constructed with no processor function).
 *
 * Activatable in production behind QUEUE_BACKEND=bullmq (see env.ts).
 * createServices.ts constructs this instead of InMemoryQueue when
 * bootstrap.ts passes a queueConfig with backend: "bullmq"; the default
 * remains InMemoryQueue (QUEUE_BACKEND defaults to "memory").
 *
 * Manual-processing mode, confirmed via direct runtime spike against a
 * real Redis-compatible instance (see project history for spike scripts,
 * not committed):
 *   - new Worker(name, undefined, opts) requires no explicit start step.
 *   - getNextJob(token) resolves with `undefined` on an empty queue,
 *     despite its .d.ts type signature claiming a non-nullable Job.
 *     This implementation always treats the result defensively.
 *   - moveToFailed() / attemptsMade / automatic retry-then-dead-letter
 *     transition are all handled natively by BullMQ; this bridge never
 *     re-implements retry or dead-letter logic itself.
 *   - moveToCompleted() / moveToFailed() are always called with
 *     fetchNext = false; dequeue() is the only place a "next job" is
 *     ever fetched, preserving a simple 1:1 mapping to IQueue's shape.
 *
 * Job name: BullMQ's Queue.add(name, data, opts) requires a job "name"
 * string that IQueue.enqueue() has no parameter for. A fixed constant
 * is used for every job on every BullMQQueue instance.
 *
 * depth(): mapped to waiting + active job counts, excluding delayed,
 * matching InMemoryQueue's "visible + invisible" semantic (a delayed
 * job is not yet eligible for dequeue, so it is not counted as
 * "visible").
 *
 * dedupeKey: mapped to BullMQ's own jobId-based deduplication. Note a
 * real semantic difference from InMemoryQueue, documented here rather
 * than silently assumed equivalent: InMemoryQueue's dedupe window ends
 * when the job is ack'd (or the queue is cleared), allowing the same
 * dedupeKey to be reused immediately after. BullMQ's jobId uniqueness
 * is effectively permanent within the queue's history, depending on
 * retention/cleanup settings -- a previously-used jobId may continue
 * to block re-enqueueing long after the original job completed. No
 * current call site in this codebase passes a dedupeKey, so this does
 * not surface today, but it is a latent behavioral difference, not an
 * oversight.
 */

import { Queue, Worker, type Job as BullJob } from "bullmq";
import type {
  IQueue,
  Job,
  EnqueueOptions,
  QueueError,
  NackOutcome,
} from "./IQueue.js";
import { ok, err } from "../core/types/common.js";
import type { Result } from "../core/types/common.js";

const JOB_NAME = "job";

export interface BullMQQueueConnection {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
}

export interface BullMQQueueOptions {
  readonly defaultMaxAttempts?: number;
  readonly lockDuration?: number;
  readonly stallIntervalMs?: number;
}

export class BullMQQueue<T> implements IQueue<T> {
  private readonly queue: Queue<T, any, string>;
  private readonly worker: Worker<T>;
  private readonly token: string;
  private readonly defaultMaxAttempts: number;
  private readonly inFlight = new Map<string, BullJob<T>>();

  constructor(
    readonly name: string,
    connection: BullMQQueueConnection,
    options: BullMQQueueOptions = {},
  ) {
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.token = `${name}-${Math.random().toString(36).slice(2, 10)}`;

    this.queue = new Queue<T, any, string>(name, { connection });

    const workerOpts: Record<string, unknown> = { connection };
    if (options.lockDuration !== undefined) {
      workerOpts["lockDuration"] = options.lockDuration;
    }
    if (options.stallIntervalMs !== undefined) {
      workerOpts["stalledInterval"] = options.stallIntervalMs;
    }
    this.worker = new Worker<T>(name, undefined, workerOpts as never);

    // BullMQ's Queue and Worker both extend Node's EventEmitter and emit an
    // 'error' event for faults that surface outside any awaited call (e.g.
    // certain ioredis connection/reconnection failures) -- these are NOT
    // caught by the try/catch blocks in enqueue()/dequeue()/ack()/nack()/
    // depth() below, since those only catch rejections from awaited method
    // calls, not EventEmitter 'error' events. Listeners here only log -- no
    // process-level uncaughtException/unhandledRejection handling is added,
    // and the existing Result-returning behavior of every public method is
    // unchanged.
    this.queue.on("error", (e: Error) => {
      console.error(
        `[bullmq:error] source=queue queue="${this.name}" message=${e.message}`,
        e,
      );
    });
    this.worker.on("error", (e: Error) => {
      console.error(
        `[bullmq:error] source=worker queue="${this.name}" message=${e.message}`,
        e,
      );
    });
  }

  async enqueue(
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<Result<string, QueueError>> {
    try {
      // ExtractNameType<T, string> cannot resolve to plain string while T is
      // an unresolved generic at this class's definition site, even though every
      // concrete instantiation of T resolves correctly (confirmed via isolated
      // repro). Narrow, targeted cast -- not a broadening of T's real contract.
      const job = await (this.queue.add as unknown as (
        name: string,
        data: T,
        opts: Record<string, unknown>,
      ) => Promise<{ id: string | undefined }>)(JOB_NAME, payload, {
        delay: options.delayMs,
        attempts: options.maxAttempts ?? this.defaultMaxAttempts,
        ...(options.dedupeKey !== undefined
          ? { jobId: options.dedupeKey }
          : {}),
      });

      if (job.id === undefined) {
        return err({
          code: "ENQUEUE_FAILED",
          message: `BullMQ returned a job with no id for queue "${this.name}"`,
        });
      }

      return ok(job.id);
    } catch (e) {
      if (
        options.dedupeKey !== undefined &&
        e instanceof Error &&
        /job.*already exists/i.test(e.message)
      ) {
        return ok(`dedupe-skipped:${options.dedupeKey}`);
      }
      return err({
        code: "ENQUEUE_FAILED",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  async dequeue(): Promise<Result<Job<T> | null, QueueError>> {
    try {
      const bullJob = (await this.worker.getNextJob(this.token, {
        block: false,
      })) as BullJob<T> | undefined;

      if (bullJob === undefined || bullJob.id === undefined) {
        return ok(null);
      }

      this.inFlight.set(bullJob.id, bullJob);

      const job: Job<T> = {
        id: bullJob.id,
        queue: this.name,
        payload: bullJob.data,
        attempts: bullJob.attemptsMade,
        maxAttempts:
          typeof bullJob.opts.attempts === "number"
            ? bullJob.opts.attempts
            : this.defaultMaxAttempts,
        enqueuedAt: new Date(bullJob.timestamp),
        dequeuedAt: new Date(),
      };

      return ok(job);
    } catch (e) {
      return err({
        code: "DEQUEUE_FAILED",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  async ack(jobId: string): Promise<Result<void, QueueError>> {
    const bullJob = this.inFlight.get(jobId);
    if (!bullJob) {
      return err({
        code: "JOB_NOT_FOUND",
        message: `Job "${jobId}" not found in queue "${this.name}"`,
      });
    }

    try {
      await bullJob.moveToCompleted(undefined, this.token, false);
      this.inFlight.delete(jobId);
      return ok(undefined);
    } catch (e) {
      return err({
        code: "ACK_FAILED",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  async nack(
    jobId: string,
    reason?: string,
  ): Promise<Result<NackOutcome, QueueError>> {
    const bullJob = this.inFlight.get(jobId);
    if (!bullJob) {
      return err({
        code: "JOB_NOT_FOUND",
        message: `Job "${jobId}" not found in queue "${this.name}"`,
      });
    }

    try {
      await bullJob.moveToFailed(
        new Error(reason ?? "nacked"),
        this.token,
        false,
      );
      this.inFlight.delete(jobId);
      // BullMQ authoritative outcome: attemptsMade is updated by
      // moveToFailed() itself, so comparing post-failure gives the
      // correct dead-letter determination without any pre-nack inference.
      const outcome: NackOutcome =
        bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1)
          ? "dead-lettered"
          : "retried";
      return ok(outcome);
    } catch (e) {
      return err({
        code: "NACK_FAILED",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  async depth(): Promise<Result<number, QueueError>> {
    try {
      const counts = await this.queue.getJobCounts("waiting", "active");
      const waiting = counts["waiting"] ?? 0;
      const active = counts["active"] ?? 0;
      return ok(waiting + active);
    } catch (e) {
      return err({
        code: "DEQUEUE_FAILED",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      });
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}