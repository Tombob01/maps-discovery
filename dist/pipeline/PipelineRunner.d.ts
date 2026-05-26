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
import type { IQueue } from "../queue/IQueue.js";
import type { IPipelineStage } from "./IPipelineStage.js";
export interface PipelineRunnerOptions {
    /** Milliseconds to wait when queue is empty before polling again. Default: 500. */
    readonly pollIntervalMs?: number;
    /** Maximum consecutive empty polls before stopping (for drain mode). Default: Infinity. */
    readonly maxEmptyPolls?: number;
}
export interface RunnerStats {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    deadLettered: number;
}
export declare class PipelineRunner<T> {
    private readonly queue;
    private readonly stage;
    private running;
    private readonly opts;
    readonly stats: RunnerStats;
    constructor(queue: IQueue<T>, stage: IPipelineStage<T>, opts?: PipelineRunnerOptions);
    /**
     * Process all currently queued jobs then stop.
     * Useful in tests and batch-mode invocations.
     */
    drain(): Promise<void>;
    /**
     * Start a continuous polling loop. Returns a promise that resolves
     * when stop() is called.
     */
    start(): Promise<void>;
    stop(): void;
    private processJob;
    private sleep;
}
//# sourceMappingURL=PipelineRunner.d.ts.map