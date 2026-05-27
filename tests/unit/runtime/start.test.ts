import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockClientEnd = vi.fn().mockResolvedValue(undefined);
const mockContainer = {
  storage: { client: { end: mockClientEnd } },
  services: {},
};

vi.mock("../../../src/runtime/bootstrap.js", () => ({
  bootstrap: vi.fn(() => mockContainer),
}));

import { bootstrap } from "../../../src/runtime/bootstrap.js";
import { start } from "../../../src/runtime/start.js";

describe("start()", () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    processOnSpy = vi
      .spyOn(process, "on")
      .mockImplementation((_event: string | symbol, _handler: (...args: unknown[]) => void) => process);
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${_code})`);
      });
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("logs all startup messages on successful boot", async () => {
    const logged: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.join(" "));
    });
    await Promise.race([start(), Promise.resolve()]);
    logSpy.mockRestore();
    expect(logged).toContain("[runtime] bootstrapping");
    expect(logged).toContain("[runtime] storage ready");
    expect(logged).toContain("[runtime] services ready");
    expect(logged).toContain("[runtime] startup complete");
  });

  it("registers SIGINT and SIGTERM handlers", async () => {
    await Promise.race([start(), Promise.resolve()]);
    const signals = processOnSpy.mock.calls.map(([sig]) => sig);
    expect(signals).toContain("SIGINT");
    expect(signals).toContain("SIGTERM");
  });

  it("shutdown handler calls storage.client.end() and exits 0", async () => {
    let capturedHandler: ((...args: unknown[]) => void) | null = null;
    processOnSpy.mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
      if (event === "SIGINT") capturedHandler = handler;
      return process;
    });
    await Promise.race([start(), Promise.resolve()]);
    expect(capturedHandler).not.toBeNull();
    await expect((capturedHandler as () => Promise<void>)()).rejects.toThrow("process.exit(0)");
    expect(mockClientEnd).toHaveBeenCalledOnce();
  });

  it("does not run shutdown twice", async () => {
    let capturedHandler: ((...args: unknown[]) => void) | null = null;
    processOnSpy.mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
      if (event === "SIGINT") capturedHandler = handler;
      return process;
    });
    await Promise.race([start(), Promise.resolve()]);
    await expect((capturedHandler as () => Promise<void>)()).rejects.toThrow("process.exit(0)");
    processExitSpy.mockClear();
    await (capturedHandler as () => Promise<void>)();
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockClientEnd).toHaveBeenCalledOnce();
  });

  it("rethrows and logs if bootstrap() throws", async () => {
    const boom = new Error("db config missing");
    vi.mocked(bootstrap).mockImplementationOnce(() => { throw boom; });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(start()).rejects.toThrow("db config missing");
    expect(errorSpy).toHaveBeenCalledWith("[runtime] startup failed", boom);
    errorSpy.mockRestore();
  });
});