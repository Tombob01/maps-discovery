/**
 * @module api/serve
 * HTTP server entrypoint.
 * Boots the runtime via bootstrap() and serves the Hono app on port 3001.
 *
 * Browser lifecycle:
 *   GoogleMapsProvider is constructed here, initialized before the server
 *   starts accepting requests, and shut down during SIGINT/SIGTERM alongside
 *   the Postgres client. This mirrors the existing storage lifecycle pattern.
 *
 * Usage:
 *   npx tsx src/api/serve.ts
 *   node --import tsx/esm src/api/serve.ts
 */

import { serve } from "@hono/node-server";
import { bootstrap } from "../runtime/bootstrap.js";
import { createServer } from "./server.js";
import {
  createGoogleMapsProvider,
  DEFAULT_GOOGLE_MAPS_POLICY,
} from "../providers/google-maps/index.js";
import { env } from "../config/env.js";

const PORT = Number(process.env["PORT"] ?? 3001);

async function main(): Promise<void> {
  const container = bootstrap();

  // ── Build a ScrapingPolicy driven by env vars ───────────────────────────
  // Spreads DEFAULT_GOOGLE_MAPS_POLICY and overrides only the browser block
  // with values validated by env.ts / Zod. Rate-limit and retry come from
  // the default (conservative production values).
  const playwrightPolicy = {
    ...DEFAULT_GOOGLE_MAPS_POLICY,
    browser: {
      ...DEFAULT_GOOGLE_MAPS_POLICY.browser,
      headless: env.playwright.headless,
      slowMoMs: env.playwright.slowMoMs,
      timeoutMs: env.playwright.timeoutMs,
      locale: env.playwright.locale,
      timezoneId: env.playwright.timezoneId,
    },
  } as const;

  // ── Construct and initialise the real provider ──────────────────────────
  const googleMapsProvider = createGoogleMapsProvider(playwrightPolicy);

  const initResult = await googleMapsProvider.initializeBrowser();
  if (!initResult.ok) {
    console.error(
      "[api] Failed to launch Playwright browser:",
      initResult.error.message,
    );
    process.exit(1);
  }
  console.log("[api] Playwright browser ready");

  // ── Start the HTTP server ───────────────────────────────────────────────
  const app = createServer(container.runtimeFacade, googleMapsProvider);

  const server = serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[api] HTTP server listening on http://localhost:${PORT}`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────
  // Shutdown order: HTTP server → Playwright browser → Postgres client.
  const shutdown = async (): Promise<void> => {
    console.log("[api] Shutting down...");
    server.close();
    await googleMapsProvider.shutdown(); // closes browser + context
    await container.storage.client.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[api] Fatal error:", err);
  process.exit(1);
});
