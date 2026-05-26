/**
 * @module api/RunService
 *
 * Business logic for creating, retrieving, and summarising runs.
 * Stateless â€” all state lives in the injected store.
 */
import { isOk } from "../core/types/common.js";
// ---------------------------------------------------------------------------
// RunService
// ---------------------------------------------------------------------------
export class RunService {
    runStore;
    recordStore;
    exporters;
    constructor(runStore, recordStore, exporters) {
        this.runStore = runStore;
        this.recordStore = recordStore;
        this.exporters = exporters;
    }
    // -------------------------------------------------------------------------
    // Runs
    // -------------------------------------------------------------------------
    async createRun(req) {
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
        const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const run = {
            id: id,
            status: "pending",
            config: {
                runId: id,
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
    async getRun(id) {
        const run = await this.runStore.findById(id);
        if (!run) {
            return {
                ok: false,
                error: { code: "NOT_FOUND", message: `Run "${id}" not found` },
            };
        }
        return { ok: true, data: toRunSummary(run) };
    }
    async listRuns() {
        const runs = await this.runStore.list();
        return { ok: true, data: runs.map(toRunSummary) };
    }
    // -------------------------------------------------------------------------
    // Records
    // -------------------------------------------------------------------------
    async listRecords(req) {
        const page = Math.max(1, req.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, req.pageSize ?? 20));
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
    async exportRun(req) {
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
}
// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
function toRunSummary(run) {
    const seed = run.config.seeds[0];
    return {
        id: run.id,
        status: run.status,
        niche: seed?.niche ?? "",
        location: seed?.location.displayName ?? "",
        startedAt: run.startedAt?.toISOString() ?? new Date(0).toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        stats: run.stats,
    };
}
function toRecordSummary(r) {
    return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        normalizedPhone: r.normalizedPhone,
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
//# sourceMappingURL=RunService.js.map