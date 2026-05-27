/**
 * @module api/server
 * Thin HTTP adapter over RuntimeFacade.
 * Routes map 1:1 to facade methods. No business logic here.
 *
 * POST /api/expand            → facade.expandKeyword()
 * POST /api/runs              → facade.createRun()
 * POST /api/runs/:id/execute  → facade.executeRun()  [mock provider — real provider TBD]
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
  /** Serialized ResolvedQuery fields the frontend sends */
  query: {
    rawText: string;
    niche: string;
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
  // The frontend cannot send a live IProvider object over HTTP.
  // This route accepts a provider ID string and a serialized query.
  // The mock provider is used for now; wiring a real Playwright provider
  // is Milestone B (see open TODOs).
  // --------------------------------------------------------------------------
  app.post("/api/runs/:id/execute", async (c) => {
    const runId = c.req.param("id");

    let body: ExecuteRunBody;
    try {
      body = await c.req.json<ExecuteRunBody>();
    } catch {
      return c.json({ ok: false, error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400);
    }

    if (!body.query?.rawText?.trim()) {
      return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "query.rawText is required" } }, 400);
    }

    // Build a minimal mock provider so the existing RuntimeFacade/RuntimeExecutor
    // chain works end-to-end. The real GoogleMapsProvider is wired in Milestone B.
    const mockProvider = buildMockProvider(body.provider ?? "mock");

    // Build a minimal ResolvedQuery from the serialized fields
    const query = buildResolvedQuery(runId, body.query, body.provider ?? "mock");

    try {
      const summary = await facade.executeRun({
        provider: mockProvider,
        runId: runId as import("../core/types/common.js").RunID,
        query,
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
// Helpers: minimal stubs for the execute route
// These exist only to satisfy the RuntimeExecutor/DiscoveryRunner interface.
// They are replaced when a real provider is wired (Milestone B).
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

function buildResolvedQuery(
  runId: string,
  q: ExecuteRunBody["query"],
  providerId: string,
): import("../core/models/Query.js").ResolvedQuery {
  const now = new Date();
  return {
    id: `qry-${Date.now()}` as import("../core/types/common.js").QueryID,
    runId: runId as import("../core/types/common.js").RunID,
    parentId: null,
    rawText: q.rawText.trim(),
    niche: q.niche?.trim() ?? q.rawText.trim(),
    geoTarget: {
      displayName: q.location?.trim() ?? "",
      country: q.location?.trim() ?? "",
    },
    providerId,
    generatedByStrategies: ["seed"],
    queryHash: `hash-${Date.now()}` as import("../core/types/common.js").QueryHash,
    lifecycleState: "generated",
    status: "pending",
    createdAt: now,
    resolvedGeoTarget: {
      displayName: q.location?.trim() ?? "",
      country: q.location?.trim() ?? "",
      resolvedCoordinates: { lat: 0, lng: 0 },
    },
  };
}
