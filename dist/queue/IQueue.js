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
export {};
//# sourceMappingURL=IQueue.js.map