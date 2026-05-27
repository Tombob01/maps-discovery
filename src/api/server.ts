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
  /** Provider ID string — resolved to a mock/real provider server-side */
  provider: string;
  /** Seed fields the frontend sends — no pre-built ResolvedQuery needed */
  seed: {
    keyword: string;
    location: string;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createServer(facade: RuntimeFacade): Hono {
  const app = new Hono();

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
  // --------------------------------------------------------------------------
  app.post("/api/expand", async (c) => {
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
  // Accepts a provider ID string + seed { keyword, location }.
  // The facade resolves the seed into a ResolvedQuery via QueryEngine.
  // The mock provider is used until Milestone C wires GoogleMapsProvider.
  // --------------------------------------------------------------------------
  app.post("/api/runs/:id/execute", async (c) => {
    const runId = c.req.param("id");

    let body: ExecuteRunBody;
    try {
      body = await c.req.json<ExecuteRunBody>();
    } catch {
      return c.json({ ok: false, error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400);
    }

    if (!body.seed?.keyword?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "seed.keyword is required" } }, 400);
    }
    if (!body.seed?.location?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "seed.location is required" } }, 400);
    }

    const mockProvider = buildMockProvider(body.provider ?? "mock");

    try {
      const summary = await facade.executeFromSeed({
        provider: mockProvider,
        runId: runId as import("../core/types/common.js").RunID,
        keyword: body.seed.keyword.trim(),
        location: body.seed.location.trim(),
      });
      return c.json({ ok: true, data: summary });
    } catch (err) {
      return c.json(
        { ok: false, error: { code: "EXECUTE_FAILED", message: err instanceof Error ? err.message : String(err) } },
        500,
      );
    }
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
      return c.json({ ok: true, data: run });
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
