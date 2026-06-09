/**
 * @module api/RunService
 *
 * Business logic for creating, retrieving, and summarising runs.
 * Stateless â€” all state lives in the injected store.
 */

import type {
  CreateRunRequest,
  RunSummary,
  ApiResult,
  RecordListRequest,
  RecordSummary,
  PaginatedResponse,
  ExportRequest,
  ExportSummary,
} from "./types.js";
import type { Run } from "../core/models/Job.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { IExporter } from "../exporters/IExporter.js";
import { isOk } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Store interfaces â€” swappable implementations (in-memory / DB)
// ---------------------------------------------------------------------------

export interface IRunStore {
  create(run: Run): Promise<void>;
  findById(id: string): Promise<Run | null>;
  list(): Promise<Run[]>;
}

export interface IRecordStore {
  findByRunId(runId: string): Promise<BusinessRecord[]>;
  list(
    req: RecordListRequest,
  ): Promise<{ items: BusinessRecord[]; total: number }>;
}

// ---------------------------------------------------------------------------
// RunService
// ---------------------------------------------------------------------------

export class RunService {
  constructor(
    private readonly runStore: IRunStore,
    private readonly recordStore: IRecordStore,
    private readonly exporters: Map<string, IExporter>,
  ) {}

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  async createRun(req: CreateRunRequest): Promise<ApiResult<RunSummary>> {
    if (!req.niche?.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "niche is required" },
      };
    }
    if (!req.location?.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "location is required" },
      };
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const run: Run = {
      id: id as import("../core/types/common.js").RunID,
      status: "pending",
      config: {
        runId: id as import("../core/types/common.js").RunID,
        seeds: [
          {
            niche: req.niche.trim(),
            location: {
              displayName: req.location.trim(),
              country: req.location.trim(),
            },
          },
        ],
        providerIds: req.providerIds ?? ["google-maps"],
        forceReprocess: false,
      },
      startedAt: now,
      completedAt: null,
      createdAt: now,
      stats: {
        queriesGenerated: 0,
        queriesDispatched: 0,
        rawResultsFound: 0,
        recordsNormalized: 0,
        recordsUnique: 0,
        recordsDuplicate: 0,
        recordsExported: 0,
        errors: 0,
      },
    };

    await this.runStore.create(run);
    return { ok: true, data: toRunSummary(run) };
  }

  async getRun(id: string): Promise<ApiResult<RunSummary>> {
    const run = await this.runStore.findById(id);
    if (!run) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `Run "${id}" not found` },
      };
    }
    return { ok: true, data: toRunSummary(run) };
  }

  async listRuns(): Promise<ApiResult<RunSummary[]>> {
    const runs = await this.runStore.list();
    return { ok: true, data: runs.map(toRunSummary) };
  }

  // -------------------------------------------------------------------------
  // Records
  // -------------------------------------------------------------------------

  async listRecords(
    req: RecordListRequest,
  ): Promise<ApiResult<PaginatedResponse<RecordSummary>>> {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, req.pageSize ?? 20));

    const { items, total } = await this.recordStore.list({
      ...req,
      page,
      pageSize,
    });

    return {
      ok: true,
      data: {
        items: items.map(toRecordSummary),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async exportRun(req: ExportRequest): Promise<ApiResult<ExportSummary>> {
    if (!req.runId?.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "runId is required" },
      };
    }

    const exporter = this.exporters.get(req.format);
    if (!exporter) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_FORMAT",
          message: `Format "${req.format}" is not supported`,
        },
      };
    }

    const records = await this.recordStore.findByRunId(req.runId);
    if (records.length === 0) {
      return {
        ok: false,
        error: {
          code: "NO_RECORDS",
          message: `No records found for run "${req.runId}"`,
        },
      };
    }

    const result = await exporter.export(records, req.destination);
    if (!isOk(result)) {
      return {
        ok: false,
        error: { code: "EXPORT_FAILED", message: result.error.message },
      };
    }

    return {
      ok: true,
      data: {
        recordsExported: result.value.recordsWritten,
        format: result.value.format,
        destination: result.value.destination,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Export to in-memory string (used by RuntimeFacade for HTTP streaming)
  // -------------------------------------------------------------------------

  async getRecordsForExport(runId: string): Promise<BusinessRecord[]> {
    return this.recordStore.findByRunId(runId);
  }

  async exportRunToString(
    runId: string,
    format: "csv" | "jsonl",
  ): Promise<{ content: string; recordsExported: number }> {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new Error(`Unsupported export format: "${format}"`);
    }
    const records = await this.recordStore.findByRunId(runId);
    if (records.length === 0) {
      throw new Error(`NO_RECORDS: No records found for run "${runId}"`);
    }
    let captured = "";
    const captureAdapter: import("../exporters/JsonLinesExporter.js").WriteAdapter =
      async (_dest: string, content: string) => {
        captured = content;
      };
    let freshExporter: import("../exporters/IExporter.js").IExporter;
    if (format === "csv") {
      const { CsvExporter } = await import("../exporters/CsvExporter.js");
      freshExporter = new CsvExporter(captureAdapter);
    } else {
      const { JsonLinesExporter } = await import("../exporters/JsonLinesExporter.js");
      freshExporter = new JsonLinesExporter(captureAdapter);
    }
    const result = await freshExporter.export(records, "__capture__");
    if (!result.ok) {
      throw new Error(`Export failed: ${result.error.message}`);
    }
    return { content: captured, recordsExported: result.value.recordsWritten };
  }
}
// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toRunSummary(run: Run): RunSummary {
  const seed = run.config.seeds[0];
  return {
    id: run.id as string,
    status: run.status,
    niche: seed?.niche ?? "",
    location: seed?.location.displayName ?? "",
    startedAt: run.startedAt?.toISOString() ?? new Date(0).toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    stats: run.stats,
  };
}

function toRecordSummary(r: BusinessRecord): RecordSummary {
  return {
    id: r.id as string,
    name: r.name,
    phone: r.phone,
    normalizedPhone: r.normalizedPhone as string | null,
    website: r.website,
    city: r.address.city,
    country: r.address.country,
    primaryCategory: r.primaryCategory,
    rating: r.rating,
    sourceProvider: r.sourceProvider,
    normalizationStatus: r.normalizationStatus,
    deduplicationStatus: r.deduplicationStatus,
    exportStatus: r.exportStatus,
  };
}
