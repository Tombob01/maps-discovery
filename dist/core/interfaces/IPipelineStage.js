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
export {};
//# sourceMappingURL=IPipelineStage.js.map