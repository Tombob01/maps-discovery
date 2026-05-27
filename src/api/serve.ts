/**
 * @module api/serve
 * HTTP server entrypoint.
 * Boots the runtime via bootstrap() and serves the Hono app on port 3001.
 *
 * Usage:
 *   npx tsx src/api/serve.ts
 *   node --import tsx/esm src/api/serve.ts
 */

import { serve } from "@hono/node-server";
import { bootstrap } from "../runtime/bootstrap.js";
import { createServer } from "./server.js";

const PORT = Number(process.env["PORT"] ?? 3001);

async function main(): Promise<void> {
  const container = bootstrap();
  const app = createServer(container.runtimeFacade);

  const server = serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[api] HTTP server listening on http://localhost:${PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    console.log("[api] Shutting down...");
    server.close();
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
