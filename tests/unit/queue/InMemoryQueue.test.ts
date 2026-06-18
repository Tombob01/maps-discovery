/**
 * tests/unit/queue/InMemoryQueue.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import { isOk, isErr } from "../../../src/core/types/common.js";

interface Payload {
  task: string;
  value: number;
}

function makeQueue(opts = {}) {
  return new InMemoryQueue<Payload>("test-queue", opts);
}

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” enqueue()", () => {
  let q: InMemoryQueue<Payload>;
  beforeEach(() => {
    q = makeQueue();
  });

  it("returns ok with a job id string", async () => {
    const r = await q.enqueue({ task: "normalize", value: 1 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(typeof r.value).toBe("string");
  });

  it("depth increases after enqueue", async () => {
    await q.enqueue({ task: "a", value: 1 });
    await q.enqueue({ task: "b", value: 2 });
    const d = await q.depth();
    expect(isOk(d) && d.value).toBe(2);
  });

  it("respects maxDepth â€” returns QUEUE_FULL", async () => {
    const limited = new InMemoryQueue<Payload>("limited", { maxDepth: 2 });
    await limited.enqueue({ task: "a", value: 1 });
    await limited.enqueue({ task: "b", value: 2 });
    const r = await limited.enqueue({ task: "c", value: 3 });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("QUEUE_FULL");
  });

  it("deduplication: second enqueue with same key returns sentinel", async () => {
    await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "key-1" });
    const r = await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "key-1" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toMatch(/^dedupe-skipped:/);
  });

  it("deduplication: depth stays 1 after duplicate enqueue", async () => {
    await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "k" });
    await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "k" });
    const d = await q.depth();
    expect(isOk(d) && d.value).toBe(1);
  });

  it("different dedupeKeys are independent", async () => {
    await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "k1" });
    const r = await q.enqueue({ task: "b", value: 2 }, { dedupeKey: "k2" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).not.toMatch(/^dedupe-skipped:/);
  });
});

// ---------------------------------------------------------------------------
// dequeue
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” dequeue()", () => {
  let q: InMemoryQueue<Payload>;
  beforeEach(() => {
    q = makeQueue();
  });

  it("returns null on empty queue", async () => {
    const r = await q.dequeue();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("returns the enqueued job with incremented attempts", async () => {
    await q.enqueue({ task: "normalize", value: 42 });
    const r = await q.dequeue();
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value) {
      expect(r.value.payload).toEqual({ task: "normalize", value: 42 });
      expect(r.value.attempts).toBe(1);
      expect(r.value.dequeuedAt).toBeInstanceOf(Date);
    }
  });

  it("dequeued job is invisible â€” second dequeue returns null", async () => {
    await q.enqueue({ task: "a", value: 1 });
    await q.dequeue();
    const r = await q.dequeue();
    expect(isOk(r) && r.value).toBeNull();
  });

  it("respects FIFO order", async () => {
    await q.enqueue({ task: "first", value: 1 });
    await q.enqueue({ task: "second", value: 2 });
    const r1 = await q.dequeue();
    const r2 = await q.dequeue(); // second is null (invisible), so ack first
    await q.ack((isOk(r1) ? r1.value?.id : undefined) ?? "");
    const r3 = await q.dequeue();
    if (isOk(r1) && r1.value) expect(r1.value.payload.task).toBe("first");
    if (isOk(r3) && r3.value) expect(r3.value.payload.task).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// ack
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” ack()", () => {
  let q: InMemoryQueue<Payload>;
  beforeEach(() => {
    q = makeQueue();
  });

  it("ack removes the job â€” depth decreases", async () => {
    await q.enqueue({ task: "x", value: 0 });
    const dq = await q.dequeue();
    if (isOk(dq) && dq.value) await q.ack(dq.value.id);
    const d = await q.depth();
    expect(isOk(d) && d.value).toBe(0);
  });

  it("ack returns err for unknown job id", async () => {
    const r = await q.ack("nonexistent-id");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("JOB_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// nack
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” nack()", () => {
  let q: InMemoryQueue<Payload>;
  beforeEach(() => {
    q = makeQueue({ defaultMaxAttempts: 3 });
  });

  it("nack re-queues the job (makes it visible again)", async () => {
    await q.enqueue({ task: "retry", value: 1 });
    const dq = await q.dequeue();
    if (isOk(dq) && dq.value) await q.nack(dq.value.id, "transient error");
    const r = await q.dequeue();
    expect(isOk(r) && r.value).not.toBeNull();
    if (isOk(r) && r.value) expect(r.value.payload.task).toBe("retry");
  });

  it("nack returns 'retried' outcome when attempts remain", async () => {
    await q.enqueue({ task: "retry", value: 1 });
    const dq = await q.dequeue();
    expect(isOk(dq) && dq.value).not.toBeNull();
    if (isOk(dq) && dq.value) {
      const r = await q.nack(dq.value.id, "transient");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe("retried");
    }
  });

  it("nack returns 'dead-lettered' outcome when attempts exhausted", async () => {
    const single = new InMemoryQueue<Payload>("dl-outcome", { defaultMaxAttempts: 1 });
    await single.enqueue({ task: "fail", value: 0 });
    const dq = await single.dequeue();
    expect(isOk(dq) && dq.value).not.toBeNull();
    if (isOk(dq) && dq.value) {
      const r = await single.nack(dq.value.id);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe("dead-lettered");
    }
  });

  it("nack returns err for unknown job id", async () => {
    const r = await q.nack("bad-id");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("JOB_NOT_FOUND");
  });

  it("dead-letters job after maxAttempts reached", async () => {
    const single = new InMemoryQueue<Payload>("dl-queue", {
      defaultMaxAttempts: 1,
    });
    await single.enqueue({ task: "fail", value: 0 });
    const dq = await single.dequeue();
    if (isOk(dq) && dq.value) await single.nack(dq.value.id);
    // Dead-lettered job should not appear in dequeue
    const r = await single.dequeue();
    expect(isOk(r) && r.value).toBeNull();
    expect(single.deadLetterCount).toBe(1);
  });

  it("depth excludes dead-lettered jobs", async () => {
    const single = new InMemoryQueue<Payload>("dl-q2", {
      defaultMaxAttempts: 1,
    });
    await single.enqueue({ task: "fail", value: 0 });
    const dq = await single.dequeue();
    if (isOk(dq) && dq.value) await single.nack(dq.value.id);
    const d = await single.depth();
    expect(isOk(d) && d.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” clear()", () => {
  it("resets depth to 0", async () => {
    const q = makeQueue();
    await q.enqueue({ task: "a", value: 1 });
    await q.enqueue({ task: "b", value: 2 });
    q.clear();
    const d = await q.depth();
    expect(isOk(d) && d.value).toBe(0);
  });

  it("allows re-enqueue of previously deduped key after clear", async () => {
    const q = makeQueue();
    await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "k" });
    q.clear();
    const r = await q.enqueue({ task: "a", value: 1 }, { dedupeKey: "k" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).not.toMatch(/^dedupe-skipped:/);
  });
});

// ---------------------------------------------------------------------------
// Job metadata
// ---------------------------------------------------------------------------

describe("InMemoryQueue â€” job metadata", () => {
  it("job carries correct queue name", async () => {
    const q = new InMemoryQueue<Payload>("my-stage");
    await q.enqueue({ task: "x", value: 0 });
    const r = await q.dequeue();
    if (isOk(r) && r.value) expect(r.value.queue).toBe("my-stage");
  });

  it("enqueuedAt is a Date", async () => {
    const q = makeQueue();
    await q.enqueue({ task: "x", value: 0 });
    const r = await q.dequeue();
    if (isOk(r) && r.value) expect(r.value.enqueuedAt).toBeInstanceOf(Date);
  });

  it("respects custom maxAttempts from enqueue options", async () => {
    const q = makeQueue();
    await q.enqueue({ task: "x", value: 0 }, { maxAttempts: 10 });
    const r = await q.dequeue();
    if (isOk(r) && r.value) expect(r.value.maxAttempts).toBe(10);
  });
});
