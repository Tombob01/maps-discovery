/**
 * @module pipeline/PipelineRunner
 *
 * Drives an IPipelineStage by polling an IQueue, executing the stage,
 * and ack/nack-ing based on the result.
 *
 * Concurrency: processes one job at a time per runner instance.
 * For parallel processing, instantiate multiple runners on the same queue.
 *
 * Lifecycle:
 *   runner.start()  → begins polling loop
 *   runner.stop()   → signals loop to exit after current job
 *   runner.drain()  → processes all currently queued jobs then stops
 */
import { isOk } from "../core/types/common.js";
export class PipelineRunner {
    queue;
    stage;
    running = false;
    opts;
    stats = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        deadLettered: 0,
    };
    constructor(queue, stage, opts = {}) {
        this.queue = queue;
        this.stage = stage;
        this.opts = {
            pollIntervalMs: opts.pollIntervalMs ?? 500,
            maxEmptyPolls: opts.maxEmptyPolls ?? Infinity,
        };
    }
    /**
     * Process all currently queued jobs then stop.
     * Useful in tests and batch-mode invocations.
     */
    async drain() {
        let emptyPolls = 0;
        const maxEmpty = 2; // drain stops after 2 empty polls in a row
        while (true) {
            const dequeueResult = await this.queue.dequeue();
            if (!isOk(dequeueResult))
                break;
            const job = dequeueResult.value;
            if (job === null) {
                emptyPolls++;
                if (emptyPolls >= maxEmpty)
                    break;
                continue;
            }
            emptyPolls = 0;
            await this.processJob(job);
        }
    }
    /**
     * Start a continuous polling loop. Returns a promise that resolves
     * when stop() is called.
     */
    async start() {
        this.running = true;
        let emptyPolls = 0;
        while (this.running) {
            const dequeueResult = await this.queue.dequeue();
            if (!isOk(dequeueResult)) {
                await this.sleep(this.opts.pollIntervalMs);
                continue;
            }
            const job = dequeueResult.value;
            if (job === null) {
                emptyPolls++;
                if (emptyPolls >= this.opts.maxEmptyPolls)
                    break;
                await this.sleep(this.opts.pollIntervalMs);
                continue;
            }
            emptyPolls = 0;
            await this.processJob(job);
        }
        this.running = false;
    }
    stop() {
        this.running = false;
    }
    // ---------------------------------------------------------------------------
    async processJob(job) {
        this.stats.processed++;
        const ctx = {
            runId: job.payload &&
                typeof job.payload === "object" &&
                "runId" in job.payload &&
                typeof job.payload.runId === "string"
                ? job.payload.runId
                : "unknown",
            stageId: job.id,
            attempt: job.attempts,
        };
        const result = await this.stage.execute(job.payload, ctx);
        if (isOk(result)) {
            const stageResult = result.value;
            if (stageResult.skipped) {
                this.stats.skipped++;
            }
            else if (stageResult.success) {
                this.stats.succeeded++;
            }
            else {
                this.stats.failed++;
            }
            await this.queue.ack(job.id);
        }
        else {
            // Infrastructure failure — nack for retry or dead-letter
            this.stats.failed++;
            const nackResult = await this.queue.nack(job.id, result.error.message);
            if (isOk(nackResult)) {
                // Check if it got dead-lettered (attempts exhausted)
                if (job.attempts >= job.maxAttempts) {
                    this.stats.deadLettered++;
                }
            }
        }
    }
    sleep(ms) {
        return new Promise((resolve) => {
            // Vitest/Node environment: use a dynamic dispatch to avoid missing lib type
            const fn = Function("cb", "ms", "return setTimeout(cb, ms)");
            fn(resolve, ms);
        });
    }
}
//# sourceMappingURL=PipelineRunner.js.map