/**
 * tests/unit/queue/BullMQQueue.test.ts
 *
 * Unit tests for BullMQQueue. bullmq is fully mocked via vi.mock("bullmq") --
 * no real Redis required, consistent with the project's established
 * dependency-boundary-mocking convention (see PostgresRawResultRepository.test.ts,
 * PostgresRunRepository.test.ts).
 *
 * Per design review: strict FIFO ordering is NOT asserted, since it is an
 * InMemoryQueue implementation detail, not part of the IQueue contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { isOk, isErr } from "../../../src/core/types/common.js";

const mockQueueAdd = vi.fn();
const mockQueueGetJobCounts = vi.fn();
const mockQueueClose = vi.fn();
const mockWorkerGetNextJob = vi.fn();
const mockWorkerClose = vi.fn();

const createdQueues: EventEmitter[] = [];
const createdWorkers: EventEmitter[] = [];

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(() => {
      const q = new EventEmitter() as EventEmitter & Record<string, unknown>;
      q["add"] = mockQueueAdd;
      q["getJobCounts"] = mockQueueGetJobCounts;
      q["close"] = mockQueueClose;
      createdQueues.push(q);
      return q;
    }),
    Worker: vi.fn().mockImplementation(() => {
      const w = new EventEmitter() as EventEmitter & Record<string, unknown>;
      w["getNextJob"] = mockWorkerGetNextJob;
      w["close"] = mockWorkerClose;
      createdWorkers.push(w);
      return w;
    }),
  };
});

const { BullMQQueue } = await import("../../../src/queue/BullMQQueue.js");

interface Payload {
  task: string;
}

function makeMockBullJob(overrides: Partial<{
  id: string;
  data: Payload;
  attemptsMade: number;
  opts: { attempts?: number };
  timestamp: number;
  moveToCompleted: ReturnType<typeof vi.fn>;
  moveToFailed: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    id: "1",
    data: { task: "normalize" },
    attemptsMade: 0,
    opts: { attempts: 3 },
    timestamp: Date.now(),
    moveToCompleted: vi.fn().mockResolvedValue([]),
    moveToFailed: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeQueue() {
  return new BullMQQueue<Payload>("test-queue", {
    host: "localhost",
    port: 6379,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createdQueues.length = 0;
  createdWorkers.length = 0;
});

describe("BullMQQueue — enqueue()", () => {
  it("returns ok with the BullMQ job id", async () => {
    mockQueueAdd.mockResolvedValue({ id: "123" });
    const q = makeQueue();
    const r = await q.enqueue({ task: "normalize" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("123");
  });

  it("calls Queue.add with a fixed job name and the payload", async () => {
    mockQueueAdd.mockResolvedValue({ id: "123" });
    const q = makeQueue();
    await q.enqueue({ task: "normalize" });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "job",
      { task: "normalize" },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it("maps dedupeKey to BullMQ's jobId option", async () => {
    mockQueueAdd.mockResolvedValue({ id: "my-dedupe-key" });
    const q = makeQueue();
    await q.enqueue({ task: "normalize" }, { dedupeKey: "my-dedupe-key" });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "job",
      { task: "normalize" },
      expect.objectContaining({ jobId: "my-dedupe-key" }),
    );
  });

  it("returns a dedupe-skipped sentinel when BullMQ rejects a duplicate jobId", async () => {
    mockQueueAdd.mockRejectedValue(new Error("Job my-key already exists"));
    const q = makeQueue();
    const r = await q.enqueue({ task: "normalize" }, { dedupeKey: "my-key" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("dedupe-skipped:my-key");
  });

  it("propagates an unexpected enqueue error as ENQUEUE_FAILED", async () => {
    mockQueueAdd.mockRejectedValue(new Error("connection refused"));
    const q = makeQueue();
    const r = await q.enqueue({ task: "normalize" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("ENQUEUE_FAILED");
      expect(r.error.message).toContain("connection refused");
    }
  });

  it("returns ENQUEUE_FAILED when BullMQ returns a job with no id", async () => {
    mockQueueAdd.mockResolvedValue({ id: undefined });
    const q = makeQueue();
    const r = await q.enqueue({ task: "normalize" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("ENQUEUE_FAILED");
  });
});

describe("BullMQQueue — dequeue()", () => {
  it("returns null when getNextJob resolves with undefined", async () => {
    mockWorkerGetNextJob.mockResolvedValue(undefined);
    const q = makeQueue();
    const r = await q.dequeue();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("maps a fetched BullMQ job into the IQueue Job<T> shape", async () => {
    const bullJob = makeMockBullJob({
      id: "42",
      data: { task: "normalize" },
      attemptsMade: 1,
      opts: { attempts: 5 },
    });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    const r = await q.dequeue();
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value) {
      expect(r.value.id).toBe("42");
      expect(r.value.payload).toEqual({ task: "normalize" });
      expect(r.value.attempts).toBe(1);
      expect(r.value.maxAttempts).toBe(5);
      expect(r.value.dequeuedAt).toBeInstanceOf(Date);
    }
  });

  it("calls getNextJob with block: false", async () => {
    mockWorkerGetNextJob.mockResolvedValue(undefined);
    const q = makeQueue();
    await q.dequeue();
    expect(mockWorkerGetNextJob).toHaveBeenCalledWith(
      expect.any(String),
      { block: false },
    );
  });

  it("propagates a getNextJob rejection as DEQUEUE_FAILED", async () => {
    mockWorkerGetNextJob.mockRejectedValue(new Error("redis unreachable"));
    const q = makeQueue();
    const r = await q.dequeue();
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("DEQUEUE_FAILED");
      expect(r.error.message).toContain("redis unreachable");
    }
  });
});

describe("BullMQQueue — ack()", () => {
  it("calls moveToCompleted with fetchNext=false on the in-flight job", async () => {
    const bullJob = makeMockBullJob({ id: "1" });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.ack("1");
    expect(isOk(r)).toBe(true);
    expect(bullJob.moveToCompleted).toHaveBeenCalledWith(
      undefined,
      expect.any(String),
      false,
    );
  });

  it("returns JOB_NOT_FOUND for an id never dequeued", async () => {
    const q = makeQueue();
    const r = await q.ack("never-dequeued");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("JOB_NOT_FOUND");
  });

  it("propagates a moveToCompleted rejection as ACK_FAILED", async () => {
    const bullJob = makeMockBullJob({ id: "1" });
    bullJob.moveToCompleted.mockRejectedValue(new Error("lock expired"));
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.ack("1");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("ACK_FAILED");
      expect(r.error.message).toContain("lock expired");
    }
  });
});

describe("BullMQQueue — nack()", () => {
  it("calls moveToFailed with fetchNext=false on the in-flight job", async () => {
    const bullJob = makeMockBullJob({ id: "1" });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.nack("1", "transient error");
    expect(isOk(r)).toBe(true);
    expect(bullJob.moveToFailed).toHaveBeenCalledWith(
      expect.objectContaining({ message: "transient error" }),
      expect.any(String),
      false,
    );
  });

  it("nack returns 'retried' outcome when attempts not exhausted", async () => {
    const bullJob = makeMockBullJob({ id: "1", attemptsMade: 0, opts: { attempts: 3 } });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.nack("1", "transient");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("retried");
  });

  it("nack returns 'dead-lettered' outcome when attempts exhausted", async () => {
    const bullJob = makeMockBullJob({ id: "1", attemptsMade: 2, opts: { attempts: 2 } });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.nack("1", "final fail");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("dead-lettered");
  });

  it("delegates retry decision entirely to BullMQ — does not re-enqueue manually", async () => {
    const bullJob = makeMockBullJob({ id: "1", attemptsMade: 0, opts: { attempts: 3 } });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    await q.nack("1");
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("returns JOB_NOT_FOUND for an id never dequeued", async () => {
    const q = makeQueue();
    const r = await q.nack("never-dequeued");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("JOB_NOT_FOUND");
  });

  it("propagates a moveToFailed rejection as NACK_FAILED", async () => {
    const bullJob = makeMockBullJob({ id: "1" });
    bullJob.moveToFailed.mockRejectedValue(new Error("lock expired"));
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    const r = await q.nack("1");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("NACK_FAILED");
      expect(r.error.message).toContain("lock expired");
    }
  });

  it("uses a default reason when none is provided", async () => {
    const bullJob = makeMockBullJob({ id: "1" });
    mockWorkerGetNextJob.mockResolvedValue(bullJob);
    const q = makeQueue();
    await q.dequeue();
    await q.nack("1");
    expect(bullJob.moveToFailed).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
      expect.any(String),
      false,
    );
  });
});

describe("BullMQQueue — depth()", () => {
  it("sums waiting and active job counts", async () => {
    mockQueueGetJobCounts.mockResolvedValue({ waiting: 3, active: 2 });
    const q = makeQueue();
    const r = await q.depth();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(5);
  });

  it("excludes delayed jobs from the count", async () => {
    mockQueueGetJobCounts.mockResolvedValue({ waiting: 1, active: 0 });
    const q = makeQueue();
    await q.depth();
    expect(mockQueueGetJobCounts).toHaveBeenCalledWith("waiting", "active");
  });

  it("treats missing count fields as zero", async () => {
    mockQueueGetJobCounts.mockResolvedValue({});
    const q = makeQueue();
    const r = await q.depth();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(0);
  });

  it("propagates a getJobCounts rejection as an error result", async () => {
    mockQueueGetJobCounts.mockRejectedValue(new Error("redis timeout"));
    const q = makeQueue();
    const r = await q.depth();
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.message).toContain("redis timeout");
  });
});
describe("BullMQQueue � error event handling", () => {
  it("attaches an 'error' listener to the Queue instance during construction", () => {
    makeQueue();
    const q = createdQueues[createdQueues.length - 1]!;
    expect(q.listenerCount("error")).toBeGreaterThan(0);
  });

  it("attaches an 'error' listener to the Worker instance during construction", () => {
    makeQueue();
    const w = createdWorkers[createdWorkers.length - 1]!;
    expect(w.listenerCount("error")).toBeGreaterThan(0);
  });

  it("emitting 'error' on the Queue instance does not throw through the test process", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    makeQueue();
    const q = createdQueues[createdQueues.length - 1]!;
    expect(() => q.emit("error", new Error("redis connection lost"))).not.toThrow();
    errorSpy.mockRestore();
  });

  it("emitting 'error' on the Worker instance does not throw through the test process", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    makeQueue();
    const w = createdWorkers[createdWorkers.length - 1]!;
    expect(() => w.emit("error", new Error("stalled job"))).not.toThrow();
    errorSpy.mockRestore();
  });
});
