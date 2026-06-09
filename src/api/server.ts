/**
 * @module api/server
 * Thin HTTP adapter over RuntimeFacade.
 * Routes map 1:1 to facade methods. No business logic here.
 *
 * POST /api/expand            → facade.expandKeyword()
 * POST /api/runs              → facade.createRun()
 * POST /api/runs/:id/execute  → facade.executeFromSeed()
 * GET  /api/runs/:id          → facade.getRun()
 * GET  /api/runs/:id/records  → facade.listRecords()
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { RuntimeFacade } from "../runtime/RuntimeFacade.js";
import type { IProvider } from "../core/interfaces/IProvider.js";

// ---------------------------------------------------------------------------
// Request body shapes expected from the frontend
// ---------------------------------------------------------------------------

interface ExpandBody {
  keyword: string;
  location?: string;
  limit?: number;
}

interface CreateRunBody {
  niche: string;
  location: string;
}
interface ExecuteRunBody {
  /** Provider ID string - resolved to a mock/real provider server-side */
  provider: string;
  /** One seed per selected keyword - all run sequentially under the same runId */
  seeds: Array<{
    keyword: string;
    location: string;
  }>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @param facade        - The RuntimeFacade (public API surface).
 * @param googleMapsProvider - Optional real GoogleMapsProvider injected by serve.ts.
 *   When absent (tests, no Playwright), the mock provider is used as fallback.
 */
export function createServer(
  facade: RuntimeFacade,
  googleMapsProvider?: IProvider,
): Hono {
  const app = new Hono();

  // Concurrency guard � one discovery run at a time
  let isExecuting = false;
  // Runtime-only visibility state.
  //
  // Safe because this server currently allows only one active execution
  // at a time via `isExecuting`. If concurrent run execution is introduced
  // in the future, revisit this tracking mechanism and the execution model.
  const currentSeedByRun = new Map<string, string>();

  // Allow the Vite dev server (port 5173) to call this API (port 3001)
  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  // --------------------------------------------------------------------------
  // POST /api/expand
  app.post("/api/expand", async (c) => {
  // --------------------------------------------------------------------------
    let body: ExpandBody;
    try {
      body = await c.req.json<ExpandBody>();
    } catch {
      return c.json({ ok: false, error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400);
    }

    if (!body.keyword?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "keyword is required" } }, 400);
    }

    const result = await facade.expandKeyword({
      keyword: body.keyword.trim(),
      ...(body.location ? { location: body.location } : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
    });

    return c.json({ ok: true, data: result });
  });

  // --------------------------------------------------------------------------
  // POST /api/runs
  // --------------------------------------------------------------------------
  app.post("/api/runs", async (c) => {
    let body: CreateRunBody;
    try {
      body = await c.req.json<CreateRunBody>();
    } catch {
      return c.json({ ok: false, error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400);
    }

    if (!body.niche?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "niche is required" } }, 400);
    }
    if (!body.location?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "location is required" } }, 400);
    }

    try {
      const result = await facade.createRun({ niche: body.niche.trim(), location: body.location.trim() });
      return c.json({ ok: true, data: result }, 201);
    } catch (err) {
      return c.json(
        { ok: false, error: { code: "CREATE_FAILED", message: err instanceof Error ? err.message : String(err) } },
        500,
      );
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/runs/:id/execute
  //
  // Fire-and-forget: returns 202 immediately, runs pipeline in background.
  // Client polls GET /api/runs/:id for live status and stats.
  // --------------------------------------------------------------------------
  app.post("/api/runs/:id/execute", async (c) => {
    const runId = c.req.param("id");

    if (isExecuting) {
      return c.json(
        { ok: false, error: { code: "CONFLICT", message: "A discovery run is already in progress." } },
        409,
      );
    }

    let body: ExecuteRunBody;
    try {
      body = await c.req.json<ExecuteRunBody>();
    } catch {
      return c.json({ ok: false, error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400);
    }
    if (!Array.isArray(body.seeds) || body.seeds.length === 0) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "seeds must be a non-empty array" } }, 400);
    }
    for (const seed of body.seeds) {
      if (!seed.keyword?.trim()) {
        return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "each seed must have a keyword" } }, 400);
      }
      if (!seed.location?.trim()) {
        return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "each seed must have a location" } }, 400);
      }
    }

    const provider: IProvider =
      body.provider === "google-maps" && googleMapsProvider !== undefined
        ? googleMapsProvider
        : buildMockProvider(body.provider ?? "mock");

    // Capture seeds before async boundary to avoid closure issues.
    const seedsCopy = body.seeds.map(s => ({
      keyword: s.keyword.trim(),
      location: s.location.trim(),
    }));

    // Set guard before returning so concurrent requests are rejected immediately.
    isExecuting = true;
    void (async () => {

    // Background pipeline � client polls GET /api/runs/:id for updates.
      for (const seed of seedsCopy) {
        currentSeedByRun.set(runId, seed.keyword);
        try {
          await facade.executeFromSeed({
            provider,
            runId: runId as import("../core/types/common.js").RunID,
            keyword: seed.keyword,
            location: seed.location,
          });
        } catch (err) {
          console.error(
            "[execute:seed-failed] keyword=" + seed.keyword +
            " error=" + (err instanceof Error ? err.message : String(err)),
          );
          // continue to next seed � failure of one keyword must not stop the batch
        }
      }
    })()
      .catch((err) => {
        console.error(
          "[execute:background] run failed:",
          err instanceof Error ? err.message : String(err),
        );
      })
      .finally(() => {
        isExecuting = false;
        currentSeedByRun.delete(runId);
      });

    return c.json({ ok: true, data: { runId, status: "running" } }, 202);
  });

  // --------------------------------------------------------------------------
  // GET /api/runs/:id
  // --------------------------------------------------------------------------
  app.get("/api/runs/:id", async (c) => {
    const runId = c.req.param("id");
    try {
      const run = await facade.getRun(runId);
      if (run === null) {
        return c.json({ ok: false, error: { code: "NOT_FOUND", message: `Run "${runId}" not found` } }, 404);
      }
      const currentSeed = currentSeedByRun.get(runId) ?? null;
      return c.json({ ok: true, data: { ...run, currentSeed } });
    } catch (err) {
      return c.json(
        { ok: false, error: { code: "GET_FAILED", message: err instanceof Error ? err.message : String(err) } },
        500,
      );
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/runs/:id/records
  // --------------------------------------------------------------------------
  app.get("/api/runs/:id/records", async (c) => {
    const runId = c.req.param("id");
    const page = Number(c.req.query("page") ?? "1");
    const pageSize = Number(c.req.query("pageSize") ?? "20");

    try {
      const records = await facade.listRecords(runId, isNaN(page) ? 1 : page, isNaN(pageSize) ? 20 : pageSize);
      return c.json({ ok: true, data: records });
    } catch (err) {
      return c.json(
        { ok: false, error: { code: "LIST_FAILED", message: err instanceof Error ? err.message : String(err) } },
        500,
      );
    }
  });


  // --------------------------------------------------------------------------
  // GET /api/runs/:id/export?format=csv|jsonl
  // --------------------------------------------------------------------------
  app.get("/api/runs/:id/export", async (c) => {
    const runId = c.req.param("id");
    const raw = c.req.query("format") ?? "csv";
    if (raw !== "csv" && raw !== "jsonl") {
      return c.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: `format must be "csv" or "jsonl", got "${raw}"` } },
        400,
      );
    }
    const format = raw as "csv" | "jsonl";

    try {
      const { content, filename } = await facade.exportRun(runId, format);
      const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8";
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("NO_RECORDS:")) {
        return c.json({ ok: false, error: { code: "NO_RECORDS", message: msg.replace("NO_RECORDS: ", "") } }, 404);
      }
      if (msg.startsWith("Unsupported export format")) {
        return c.json({ ok: false, error: { code: "UNSUPPORTED_FORMAT", message: msg } }, 400);
      }
      return c.json(
        { ok: false, error: { code: "EXPORT_FAILED", message: msg } },
        500,
      );
    }
  });
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockProvider(id: string): import("../core/interfaces/IProvider.js").IProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      supportsGeoFilter: false,
      supportsResultCount: false,
      supportsHours: false,
      supportsPriceLevel: false,
      supportsCoordinates: false,
      maxResultsPerQuery: 0,
    },
    policy: {
      rateLimit: {
        requestsPerMinute: 0,
        minDelayBetweenRequestsMs: 0,
        jitterMs: 0,
        maxConcurrent: 1,
      },
      retry: {
        maxAttempts: 0,
        backoffStrategy: "linear" as const,
        backoffBaseMs: 0,
        backoffCapMs: 0,
        retryableStatusCodes: [],
      },
      browser: {
        headless: true,
        recordHar: false,
        userAgent: null,
        viewport: { width: 1280, height: 800 },
        timeoutMs: 0,
        slowMoMs: 0,
        locale: "en-US",
        timezoneId: "UTC",
      },
      conservativeMode: false,
    },
    checkHealth: async () => ({ status: "healthy" as const }),
    shutdown: async () => {},
    discover: async function* () {
      // Yields nothing — normalization stage will process an empty set
    },
  };
}





