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
import { ok, err } from "../core/types/common.js";
let globalSeq = 0;
function nextId(queueName) {
    return `${queueName}-${++globalSeq}-${Date.now()}`;
}
export class InMemoryQueue {
    name;
    jobs = new Map();
    dedupeKeys = new Set();
    maxDepth;
    defaultMaxAttempts;
    constructor(name, options = {}) {
        this.name = name;
        this.maxDepth = options.maxDepth ?? Infinity;
        this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    }
    async enqueue(payload, options = {}) {
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
        const job = {
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
    async dequeue() {
        // Find oldest visible job (insertion order via Map iteration)
        for (const [id, internal] of this.jobs) {
            if (internal.visible && !internal.deadLetter) {
                const updated = {
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
    async ack(jobId) {
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
    async nack(jobId, reason) {
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
        }
        else {
            // Return to queue
            this.jobs.set(jobId, { ...internal, visible: true });
        }
        void reason; // available for logging in richer implementations
        return ok(undefined);
    }
    async depth() {
        let count = 0;
        for (const internal of this.jobs.values()) {
            if (!internal.deadLetter)
                count++;
        }
        return ok(count);
    }
    /** Number of dead-lettered jobs. */
    get deadLetterCount() {
        let count = 0;
        for (const internal of this.jobs.values()) {
            if (internal.deadLetter)
                count++;
        }
        return count;
    }
    /** Drain all jobs (for testing). */
    clear() {
        this.jobs.clear();
        this.dedupeKeys.clear();
    }
}
//# sourceMappingURL=InMemoryQueue.js.map