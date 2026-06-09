/**
 * @module tests/unit/runtime/RuntimeFacade.exportRun
 */

import { describe, it, expect, vi } from "vitest";
import { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";
import type { RunService } from "../../../src/api/RunService.js";
import type { RuntimeExecutor } from "../../../src/runtime/RuntimeExecutor.js";
import type { KeywordExpansionService } from "../../../src/ai/KeywordExpansionService.js";
import type { QueryEngine } from "../../../src/query-engine/QueryEngine.js";
import type { PassthroughGeoResolver } from "../../../src/query-engine/GeoResolver.js";
import type { ResolvedQueryFactory } from "../../../src/query-engine/ResolvedQueryFactory.js";

function makeRunService(overrides: Partial<RunService> = {}): RunService {
  return {
    createRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    listRecords: vi.fn(),
    exportRun: vi.fn(),
    getRecordsForExport: vi.fn(),
    exportRunToString: vi.fn(),
    ...overrides,
  } as unknown as RunService;
}

function makeFacade(runService: RunService): RuntimeFacade {
  return new RuntimeFacade(
    runService,
    {} as RuntimeExecutor,
    {} as KeywordExpansionService,
    {} as QueryEngine,
    {} as PassthroughGeoResolver,
    {} as ResolvedQueryFactory,
  );
}

describe("RuntimeFacade.exportRun", () => {
  it("delegates to runService.exportRunToString and returns filename", async () => {
    const runService = makeRunService({
      exportRunToString: vi.fn().mockResolvedValue({
        content: "id,name\n1,Test\n",
        recordsExported: 1,
      }),
    });
    const facade = makeFacade(runService);

    const result = await facade.exportRun("run-123", "csv");

    expect(runService.exportRunToString).toHaveBeenCalledWith("run-123", "csv");
    expect(result.content).toBe("id,name\n1,Test\n");
    expect(result.recordsExported).toBe(1);
    expect(result.filename).toBe("run-run-123.csv");
  });

  it("uses .jsonl extension for jsonl format", async () => {
    const runService = makeRunService({
      exportRunToString: vi.fn().mockResolvedValue({
        content: '{"id":"1"}\n',
        recordsExported: 1,
      }),
    });
    const facade = makeFacade(runService);

    const result = await facade.exportRun("run-456", "jsonl");

    expect(result.filename).toBe("run-run-456.jsonl");
  });

  it("propagates errors from runService", async () => {
    const runService = makeRunService({
      exportRunToString: vi.fn().mockRejectedValue(
        new Error("NO_RECORDS: No records found"),
      ),
    });
    const facade = makeFacade(runService);

    await expect(facade.exportRun("run-789", "csv")).rejects.toThrow("NO_RECORDS");
  });
});
